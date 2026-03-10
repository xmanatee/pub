/**
 * Agent daemon — background process that holds a WebRTC PeerConnection.
 *
 * Per-user (not per-slug). Registers presence online, subscribes to
 * Convex signaling updates, and responds with answers.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { DataChannel, PeerConnection } from "node-datachannel";
import { resolveAckChannel } from "../../../shared/ack-routing-core";
import {
  type BridgeMessage,
  CHANNELS,
  CONTROL_CHANNEL,
  decodeMessage,
  encodeMessage,
  makeAckMessage,
  makeDeliveryReceiptMessage,
  makeEventMessage,
  parseAckMessage,
  shouldAcknowledgeMessage,
} from "../../../shared/bridge-protocol-core";
import {
  ORDERED_DATA_CHANNEL_OPTIONS,
  WEBRTC_STUN_URLS,
} from "../../../shared/webrtc-transport-core";
import { errorMessage } from "./cli-error.js";
import { createClaudeCodeBridgeRunner } from "./live-bridge-claude-code.js";
import { createClaudeSdkBridgeRunner } from "./live-bridge-claude-sdk.js";
import { createOpenClawBridgeRunner } from "./live-bridge-openclaw.js";
import { type BridgeRunner, buildSessionBriefing } from "./live-bridge-shared.js";
import { createLiveCommandHandler } from "./live-command-handler.js";
import { createAnswer } from "./live-daemon-answer.js";
import { createDaemonIpcHandler } from "./live-daemon-ipc-handler.js";
import { createDaemonIpcServer } from "./live-daemon-ipc-server.js";
import {
  buildBridgeInstructions,
  type ChannelBuffer,
  type DaemonConfig,
  getLiveWriteReadinessError,
  LOCAL_CANDIDATE_FLUSH_MS,
  OFFER_TIMEOUT_MS,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  WRITE_ACK_TIMEOUT_MS,
} from "./live-daemon-shared.js";
import { createSignalingController } from "./live-daemon-signaling.js";
import {
  latestCliVersionPath,
  readLatestCliVersion,
  writeLiveSessionContentFile,
} from "./live-runtime/daemon-files.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const OUTBOUND_SEND_MAX_ATTEMPTS = 2;
const MAX_SEEN_INBOUND_MESSAGES = 10_000;
const MAX_BUFFERED_MESSAGES = 200;

export async function startDaemon(config: DaemonConfig): Promise<void> {
  const { apiClient, socketPath, infoPath, cliVersion, agentName } = config;

  const ndc = await import("node-datachannel");

  const buffer: ChannelBuffer = { messages: [] };
  const startTime = Date.now();
  const daemonSessionId = randomUUID();

  let stopped = false;
  let browserConnected = false;
  let bridgePrimed = false;
  let bridgePriming: Promise<void> | null = null;
  let bridgeAbort: AbortController | null = null;
  let recovering = false;
  let activeSlug: string | null = null;

  let lastAppliedBrowserOffer: string | null = null;
  let lastBrowserCandidateCount = 0;
  let lastSentCandidateCount = 0;

  const localCandidates: string[] = [];
  const pendingOutboundAcks = new Map<string, { channel: string; messageId: string }>();
  const pendingDeliveryAcks = new Map<
    string,
    { resolve: (received: boolean) => void; timeout: ReturnType<typeof setTimeout> }
  >();

  let peer: PeerConnection | null = null;
  let channels = new Map<string, DataChannel>();
  let pendingInboundBinaryMeta = new Map<string, BridgeMessage>();
  let inboundStreams = new Map<string, { streamId: string }>();
  let seenInboundMessageKeys = new Set<string>();

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let localCandidateInterval: ReturnType<typeof setInterval> | null = null;
  let localCandidateStopTimer: ReturnType<typeof setTimeout> | null = null;
  let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let pongTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastError: string | null = null;
  const debugEnabled = process.env.PUBBLUE_LIVE_DEBUG === "1";
  const versionFilePath = latestCliVersionPath();
  let bridgeRunner: BridgeRunner | null = null;
  const commandHandler = createLiveCommandHandler({
    bridgeMode: config.bridgeMode,
    debugLog: (message, error) => debugLog(message, error),
    markError,
    sendCommandMessage: async (msg) => {
      if (!browserConnected) return false;
      return sendOutboundMessageWithAck(CHANNELS.COMMAND, msg, {
        context: 'command outbound on "command"',
        maxAttempts: OUTBOUND_SEND_MAX_ATTEMPTS,
      });
    },
  });

  function debugLog(message: string, error?: unknown): void {
    if (!debugEnabled) return;
    const detail =
      error === undefined
        ? ""
        : ` | ${
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : typeof error === "string"
                ? error
                : JSON.stringify(error)
          }`;
    console.error(`[pubblue-agent] ${message}${detail}`);
  }

  function markError(message: string, error?: unknown): void {
    lastError = error === undefined ? message : `${message}: ${errorMessage(error)}`;
    debugLog(message, error);
  }

  function isLiveConnected(): boolean {
    return browserConnected && bridgePrimed;
  }

  function clearLocalCandidateTimers(): void {
    if (localCandidateInterval) {
      clearInterval(localCandidateInterval);
      localCandidateInterval = null;
    }
    if (localCandidateStopTimer) {
      clearTimeout(localCandidateStopTimer);
      localCandidateStopTimer = null;
    }
  }

  function clearHealthCheckTimer(): void {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
  }

  function clearHeartbeatTimer(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function startPingPong(): void {
    stopPingPong();
    pingTimer = setInterval(() => {
      if (!browserConnected || stopped) {
        stopPingPong();
        return;
      }
      const controlDc = channels.get(CONTROL_CHANNEL);
      if (!controlDc) return;
      try {
        controlDc.sendMessage(encodeMessage(makeEventMessage("ping")));
        if (pongTimeout) clearTimeout(pongTimeout);
        pongTimeout = setTimeout(() => {
          if (!browserConnected || stopped) return;
          debugLog("pong timeout — treating as disconnected");
          handleConnectionClosed("pong-timeout");
        }, PONG_TIMEOUT_MS);
      } catch (error) {
        debugLog("ping send failed", error);
      }
    }, PING_INTERVAL_MS);
  }

  function stopPingPong(): void {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (pongTimeout) {
      clearTimeout(pongTimeout);
      pongTimeout = null;
    }
  }

  function runHealthCheck(): void {
    if (stopped) return;
    if (cliVersion) {
      try {
        const latest = readLatestCliVersion(versionFilePath);
        if (latest && latest !== cliVersion) {
          markError(`detected CLI upgrade (${cliVersion} → ${latest}); shutting down`);
          void shutdown();
        }
      } catch (error) {
        markError("health check failed to read latest CLI version", error);
      }
    }
  }

  function startHealthCheckTimer(): void {
    clearHealthCheckTimer();
    healthCheckTimer = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL_MS);
    runHealthCheck();
  }

  function appendBufferedMessage(entry: {
    channel: string;
    msg: BridgeMessage;
    timestamp: number;
  }): void {
    if (entry.channel === CHANNELS.COMMAND) return;
    buffer.messages.push(entry);
    if (buffer.messages.length > MAX_BUFFERED_MESSAGES) {
      buffer.messages.splice(0, buffer.messages.length - MAX_BUFFERED_MESSAGES);
    }
  }

  function handleConnectionClosed(reason: string): void {
    debugLog(`connection closed: ${reason}`);
    const hadSession = browserConnected || bridgePrimed || activeSlug !== null;
    if (!hadSession) return;
    activeSlug = null;
    commandHandler.stop();
    resetNegotiationState();
    closeCurrentPeer();
    void stopBridge().catch((error) => {
      markError("failed to stop bridge after connection closed", error);
    });
  }

  // -- Channel / message management -----------------------------------------

  function emitDeliveryStatus(params: {
    channel: string;
    messageId: string;
    stage: "received" | "confirmed" | "failed";
    error?: string;
  }): void {
    if (!params.messageId || params.channel === CONTROL_CHANNEL) return;
    const controlDc = channels.get(CONTROL_CHANNEL);
    const messageDc = channels.get(params.channel);
    const encoded = encodeMessage(
      makeDeliveryReceiptMessage({
        messageId: params.messageId,
        channel: params.channel,
        stage: params.stage,
        error: params.error,
      }),
    );
    try {
      if (controlDc?.isOpen()) {
        controlDc.sendMessage(encoded);
        return;
      }
      if (messageDc?.isOpen()) {
        messageDc.sendMessage(encoded);
      }
    } catch (error) {
      debugLog("failed to emit delivery status", error);
    }
  }

  function setupChannel(name: string, dc: DataChannel): void {
    channels.set(name, dc);
    dc.onOpen(() => {
      if (name === CONTROL_CHANNEL) flushQueuedAcks();
    });

    dc.onClosed(() => {
      channels.delete(name);
      pendingInboundBinaryMeta.delete(name);
      inboundStreams.delete(name);
      debugLog(`datachannel "${name}" closed`);
    });

    dc.onError((err: string) => {
      debugLog(`datachannel "${name}" error: ${err}`);
    });

    dc.onMessage((data: string | Buffer) => {
      try {
      if (typeof data === "string") {
        const msg = decodeMessage(data);
        if (!msg) return;
        const ack = parseAckMessage(msg);
        if (ack) {
          settlePendingAck(ack.messageId, ack.channel, true);
          return;
        }
        if (msg.type === "event" && msg.data === "pong") {
          if (pongTimeout) {
            clearTimeout(pongTimeout);
            pongTimeout = null;
          }
          return;
        }
        const duplicate = isDuplicateInboundMessage(name, msg.id);
        if (duplicate) {
          if (msg.type === "binary" && !msg.data) {
            pendingInboundBinaryMeta.set(name, msg);
            return;
          }
          if (shouldAcknowledgeMessage(name, msg)) {
            queueAck(msg.id, name);
          }
          return;
        }
        if (msg.type === "stream-start") {
          inboundStreams.set(name, { streamId: msg.id });
        }
        if (msg.type === "stream-end") {
          const stream = inboundStreams.get(name);
          const requestedStreamId =
            typeof msg.meta?.streamId === "string" ? msg.meta.streamId : undefined;
          if (!stream) {
            // nothing to settle
          } else if (!requestedStreamId || requestedStreamId === stream.streamId) {
            emitDeliveryStatus({
              channel: name,
              messageId: stream.streamId,
              stage: "received",
            });
            inboundStreams.delete(name);
          }
        }
        if (msg.type === "binary" && !msg.data) {
          pendingInboundBinaryMeta.set(name, msg);
          return;
        }
        if (shouldAcknowledgeMessage(name, msg)) {
          queueAck(msg.id, name);
        }
        if (name === CHANNELS.COMMAND) {
          void commandHandler.onMessage(msg);
          return;
        }
        appendBufferedMessage({ channel: name, msg, timestamp: Date.now() });
        bridgeRunner?.enqueue([{ channel: name, msg }]);
        if (
          name !== CONTROL_CHANNEL &&
          (msg.type === "text" || msg.type === "html" || (msg.type === "binary" && !!msg.data))
        ) {
          emitDeliveryStatus({ channel: name, messageId: msg.id, stage: "received" });
        }
        return;
      }

      const pendingMeta = pendingInboundBinaryMeta.get(name);
      const activeStream = inboundStreams.get(name);
      if (pendingMeta) pendingInboundBinaryMeta.delete(name);
      if (name === CHANNELS.COMMAND) {
        return;
      }
      const binMsg: BridgeMessage = pendingMeta
        ? {
            id: pendingMeta.id,
            type: "binary",
            data: data.toString("base64"),
            meta: {
              ...pendingMeta.meta,
              ...(activeStream ? { streamId: activeStream.streamId } : {}),
              size: data.length,
            },
          }
        : {
            id: `bin-${Date.now()}`,
            type: "binary",
            data: data.toString("base64"),
            meta: {
              ...(activeStream ? { streamId: activeStream.streamId } : {}),
              size: data.length,
            },
          };
      if (isDuplicateInboundMessage(name, binMsg.id)) {
        if (shouldAcknowledgeMessage(name, binMsg)) {
          queueAck(binMsg.id, name);
        }
        return;
      }
      if (shouldAcknowledgeMessage(name, binMsg)) {
        queueAck(binMsg.id, name);
      }
      appendBufferedMessage({ channel: name, msg: binMsg, timestamp: Date.now() });
      bridgeRunner?.enqueue([{ channel: name, msg: binMsg }]);
      if (!activeStream) {
        emitDeliveryStatus({ channel: name, messageId: binMsg.id, stage: "received" });
      }
      } catch (error) {
        debugLog(`datachannel "${name}" onMessage error`, error);
      }
    });
  }

  function getAckKey(messageId: string, channel: string): string {
    return `${channel}:${messageId}`;
  }

  function isDuplicateInboundMessage(channel: string, messageId: string): boolean {
    const key = `${channel}:${messageId}`;
    if (seenInboundMessageKeys.has(key)) return true;
    seenInboundMessageKeys.add(key);
    if (seenInboundMessageKeys.size > MAX_SEEN_INBOUND_MESSAGES) {
      seenInboundMessageKeys.clear();
    }
    return false;
  }

  function queueAck(messageId: string, channel: string): void {
    pendingOutboundAcks.set(getAckKey(messageId, channel), { messageId, channel });
    flushQueuedAcks();
  }

  function flushQueuedAcks(): void {
    const controlDc = channels.get(CONTROL_CHANNEL);
    for (const [ackKey, ack] of pendingOutboundAcks) {
      const messageDc = channels.get(ack.channel);
      const targetChannel = resolveAckChannel({
        controlChannelOpen: Boolean(controlDc?.isOpen()),
        messageChannelOpen: Boolean(messageDc?.isOpen()),
        messageChannel: ack.channel,
      });
      if (!targetChannel) continue;

      const encodedAck = encodeMessage(makeAckMessage(ack.messageId, ack.channel));
      const primaryDc = targetChannel === CONTROL_CHANNEL ? controlDc : messageDc;

      try {
        if (primaryDc?.isOpen()) {
          primaryDc.sendMessage(encodedAck);
          pendingOutboundAcks.delete(ackKey);
          continue;
        }
      } catch (error) {
        markError("failed to flush queued ack on primary channel", error);
      }

      const fallbackChannel = targetChannel === ack.channel ? CONTROL_CHANNEL : ack.channel;
      const fallbackDc = fallbackChannel === CONTROL_CHANNEL ? controlDc : messageDc;
      try {
        if (fallbackDc?.isOpen()) {
          fallbackDc.sendMessage(encodedAck);
          pendingOutboundAcks.delete(ackKey);
        }
      } catch (error) {
        markError("failed to flush queued ack on fallback channel", error);
      }
    }
  }

  function waitForDeliveryAck(
    messageId: string,
    channel: string,
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const key = getAckKey(messageId, channel);
      const existing = pendingDeliveryAcks.get(key);
      if (existing) {
        clearTimeout(existing.timeout);
        pendingDeliveryAcks.delete(key);
      }
      const timeout = setTimeout(() => {
        pendingDeliveryAcks.delete(key);
        resolve(false);
      }, timeoutMs);
      pendingDeliveryAcks.set(key, { resolve, timeout });
    });
  }

  function settlePendingAck(messageId: string, channel: string, received: boolean): void {
    const key = getAckKey(messageId, channel);
    const pending = pendingDeliveryAcks.get(key);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingDeliveryAcks.delete(key);
    pending.resolve(received);
  }

  function failPendingAcks(): void {
    for (const [ackKey, pending] of pendingDeliveryAcks) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
      pendingDeliveryAcks.delete(ackKey);
    }
  }

  function openDataChannel(name: string): DataChannel {
    if (!peer) throw new Error("PeerConnection not initialized");
    const existing = channels.get(name);
    if (existing) return existing;
    const dc = peer.createDataChannel(name, ORDERED_DATA_CHANNEL_OPTIONS);
    setupChannel(name, dc);
    return dc;
  }

  async function waitForChannelOpen(dc: DataChannel, timeoutMs = 5_000): Promise<void> {
    if (dc.isOpen()) return;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("DataChannel open timed out"));
      }, timeoutMs);
      dc.onOpen(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  async function sendOutboundMessageWithAck(
    channel: string,
    msg: BridgeMessage,
    options?: { binaryPayload?: Buffer; context?: string; maxAttempts?: number },
  ): Promise<boolean> {
    const maxAttempts = options?.maxAttempts ?? OUTBOUND_SEND_MAX_ATTEMPTS;
    const context = options?.context ?? `channel "${channel}"`;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (stopped || !browserConnected) return false;

      let targetDc: DataChannel;
      try {
        targetDc = channels.get(channel) ?? openDataChannel(channel);
        await waitForChannelOpen(targetDc);
      } catch (error) {
        markError(`${context} failed to open (attempt ${attempt}/${maxAttempts})`, error);
        continue;
      }

      const waitForAck = shouldAcknowledgeMessage(channel, msg)
        ? waitForDeliveryAck(msg.id, channel, WRITE_ACK_TIMEOUT_MS)
        : null;

      try {
        if (msg.type === "binary" && options?.binaryPayload) {
          targetDc.sendMessage(
            encodeMessage({
              ...msg,
              meta: { ...(msg.meta || {}), size: options.binaryPayload.length },
            }),
          );
          targetDc.sendMessageBinary(options.binaryPayload);
        } else {
          targetDc.sendMessage(encodeMessage(msg));
        }
      } catch (error) {
        if (waitForAck) settlePendingAck(msg.id, channel, false);
        markError(`${context} failed to send (attempt ${attempt}/${maxAttempts})`, error);
        continue;
      }

      if (!waitForAck) return true;
      const acked = await waitForAck;
      if (acked) return true;
      markError(
        `${context} delivery ack timeout for message ${msg.id} (attempt ${attempt}/${maxAttempts})`,
      );
    }

    return false;
  }

  // -- Peer management ------------------------------------------------------

  function attachPeerHandlers(currentPeer: PeerConnection): void {
    currentPeer.onLocalCandidate((candidate: string, mid: string) => {
      if (stopped || currentPeer !== peer) return;
      localCandidates.push(JSON.stringify({ candidate, sdpMid: mid }));
    });

    currentPeer.onStateChange((state: string) => {
      if (stopped || currentPeer !== peer) return;
      if (state === "connected") {
        browserConnected = true;
        flushQueuedAcks();
        startPingPong();
        void ensureBridgePrimed();
        return;
      }
      if (state === "disconnected" || state === "failed" || state === "closed") {
        handleConnectionClosed(`peer-state:${state}`);
      }
    });

    currentPeer.onIceStateChange((state: string) => {
      if (stopped || currentPeer !== peer) return;
      debugLog(`ICE state: ${state}`);
      if ((state === "disconnected" || state === "failed") && browserConnected) {
        handleConnectionClosed(`ice-state:${state}`);
      }
    });

    currentPeer.onDataChannel((dc: DataChannel) => {
      if (stopped || currentPeer !== peer) return;
      setupChannel(dc.getLabel(), dc);
    });
  }

  function createPeer(): void {
    const nextPeer: PeerConnection = new ndc.PeerConnection("agent", {
      iceServers: [...WEBRTC_STUN_URLS],
    });
    peer = nextPeer;
    channels = new Map<string, DataChannel>();
    pendingInboundBinaryMeta = new Map<string, BridgeMessage>();
    inboundStreams = new Map<string, { streamId: string }>();
    seenInboundMessageKeys = new Set<string>();
    attachPeerHandlers(nextPeer);
  }

  function closeCurrentPeer(): void {
    failPendingAcks();
    for (const dc of channels.values()) {
      try {
        dc.close();
      } catch (error) {
        debugLog("failed to close data channel cleanly", error);
      }
    }
    channels.clear();
    pendingInboundBinaryMeta.clear();
    inboundStreams.clear();
    seenInboundMessageKeys.clear();
    if (peer) {
      try {
        peer.close();
      } catch (error) {
        debugLog("failed to close peer connection cleanly", error);
      }
      peer = null;
    }
  }

  function resetNegotiationState(): void {
    browserConnected = false;
    bridgePrimed = false;
    bridgePriming = null;
    buffer.messages = [];
    failPendingAcks();
    stopPingPong();
    lastAppliedBrowserOffer = null;
    lastBrowserCandidateCount = 0;
    lastSentCandidateCount = 0;
    localCandidates.length = 0;
    clearLocalCandidateTimers();
    inboundStreams.clear();
    seenInboundMessageKeys.clear();
  }

  async function clearActiveLiveSession(reason: string): Promise<void> {
    const slug = activeSlug;
    debugLog(`clearing active live session: ${reason}${slug ? ` (${slug})` : ""}`);
    activeSlug = null;
    await stopBridge();
    commandHandler.stop();
    closeCurrentPeer();
    resetNegotiationState();
  }

  function startLocalCandidateFlush(slug: string): void {
    clearLocalCandidateTimers();
    localCandidateInterval = setInterval(async () => {
      if (localCandidates.length <= lastSentCandidateCount) return;
      const newOnes = localCandidates.slice(lastSentCandidateCount);
      lastSentCandidateCount = localCandidates.length;
      await apiClient
        .signalAnswer({ slug, daemonSessionId, candidates: newOnes })
        .catch((error) => {
          debugLog("failed to publish local ICE candidates", error);
        });
    }, LOCAL_CANDIDATE_FLUSH_MS);

    localCandidateStopTimer = setTimeout(() => {
      clearLocalCandidateTimers();
    }, 30_000);
  }

  // -- Answer incoming live request (agent is the answerer) -----------------

  async function handleIncomingLive(slug: string, browserOffer: string): Promise<void> {
    if (recovering) return;
    recovering = true;

    try {
      await clearActiveLiveSession("incoming-live-recovery");
      createPeer();

      if (!peer) throw new Error("PeerConnection not initialized");

      const answer = await createAnswer(peer, browserOffer, OFFER_TIMEOUT_MS);
      lastAppliedBrowserOffer = browserOffer;
      activeSlug = slug;

      await apiClient.signalAnswer({ slug, daemonSessionId, answer, agentName });
      startLocalCandidateFlush(slug);
    } catch (error) {
      markError("failed to handle incoming live request", error);
    } finally {
      recovering = false;
    }
  }

  // -- Signaling subscription (Convex onUpdate) -----------------------------

  async function applyBrowserCandidates(candidatePayloads: string[]): Promise<void> {
    for (const c of candidatePayloads) {
      try {
        const parsed = JSON.parse(c) as { candidate?: unknown; sdpMid?: unknown };
        if (typeof parsed.candidate !== "string") continue;
        const sdpMid = typeof parsed.sdpMid === "string" ? parsed.sdpMid : "0";
        if (!peer) continue;
        peer.addRemoteCandidate(parsed.candidate, sdpMid);
      } catch (error) {
        debugLog("failed to parse/apply browser ICE candidate", error);
      }
    }
  }

  const signaling = createSignalingController({
    apiClient,
    daemonSessionId,
    debugLog,
    markError,
    isStopped: () => stopped,
    getActiveSlug: () => activeSlug,
    getLastAppliedBrowserOffer: () => lastAppliedBrowserOffer,
    getLastBrowserCandidateCount: () => lastBrowserCandidateCount,
    setLastBrowserCandidateCount: (count) => {
      lastBrowserCandidateCount = count;
    },
    onRecover: handleIncomingLive,
    onApplyBrowserCandidates: applyBrowserCandidates,
    onClearLive: async () => {
      await clearActiveLiveSession("signaling-cleared");
    },
  });

  // -- Socket stale check ---------------------------------------------------

  if (fs.existsSync(socketPath)) {
    let stale = true;
    try {
      const raw = fs.readFileSync(infoPath, "utf-8");
      const info = JSON.parse(raw) as { pid: number };
      process.kill(info.pid, 0);
      stale = false;
    } catch (error) {
      debugLog("stale socket check failed (assuming stale)", error);
    }

    if (stale) {
      try {
        fs.unlinkSync(socketPath);
      } catch (error) {
        debugLog("failed to remove stale daemon socket", error);
      }
    } else {
      throw new Error(`Daemon already running (socket: ${socketPath})`);
    }
  }

  // -- Register presence online ---------------------------------------------

  await apiClient.goOnline({ daemonSessionId, agentName });

  heartbeatTimer = setInterval(async () => {
    if (stopped) return;
    try {
      await apiClient.heartbeat({ daemonSessionId });
    } catch (error) {
      markError("heartbeat failed", error);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // -- IPC server -----------------------------------------------------------

  const handleIpcRequest = createDaemonIpcHandler({
    apiClient,
    bindCanvasCommands: (html) => commandHandler.bindFromHtml(html),
    getConnected: () => isLiveConnected(),
    getSignalingConnected: () => {
      const state = signaling.status();
      return state.known ? state.open : null;
    },
    getActiveSlug: () => activeSlug,
    getUptimeSeconds: () => Math.floor((Date.now() - startTime) / 1000),
    getChannels: () => [...channels.keys()],
    getBufferedMessages: () => buffer.messages,
    setBufferedMessages: (messages) => {
      buffer.messages = messages;
    },
    getLastError: () => lastError,
    getBridgeMode: () => config.bridgeMode ?? null,
    getBridgeStatus: () => bridgeRunner?.status() ?? null,
    getWriteReadinessError: () => getLiveWriteReadinessError(isLiveConnected()),
    openDataChannel,
    waitForChannelOpen,
    waitForDeliveryAck,
    settlePendingAck,
    markError,
    shutdown: () => {
      void shutdown();
    },
    writeAckTimeoutMs: WRITE_ACK_TIMEOUT_MS,
    writeAckMaxAttempts: OUTBOUND_SEND_MAX_ATTEMPTS,
  });

  const ipcServer = createDaemonIpcServer(handleIpcRequest);

  ipcServer.listen(socketPath);

  const infoDir = path.dirname(infoPath);
  if (!fs.existsSync(infoDir)) fs.mkdirSync(infoDir, { recursive: true });
  fs.writeFileSync(
    infoPath,
    JSON.stringify({ pid: process.pid, socketPath, startedAt: startTime, cliVersion }),
  );

  startHealthCheckTimer();
  signaling.start();

  // -- In-process bridge runner ---------------------------------------------

  async function sendOnChannel(channel: string, msg: BridgeMessage): Promise<boolean> {
    if (stopped || !isLiveConnected()) return false;
    return sendOutboundMessageWithAck(channel, msg, {
      context: `bridge outbound on "${channel}"`,
      maxAttempts: OUTBOUND_SEND_MAX_ATTEMPTS,
    });
  }

  async function buildInitialSessionBriefing(params: {
    slug: string;
    instructions: ReturnType<typeof buildBridgeInstructions>;
  }): Promise<string> {
    const pub = await apiClient.get(params.slug);
    const content = typeof pub.content === "string" ? pub.content : "";
    if (content.length > 0) commandHandler.bindFromHtml(content);
    else commandHandler.clearBindings();
    const canvasContentFilePath =
      content.length > 0
        ? writeLiveSessionContentFile({
            slug: params.slug,
            content,
          })
        : undefined;

    return buildSessionBriefing(
      params.slug,
      {
        title: pub.title,
        isPublic: pub.isPublic,
        canvasContentFilePath,
      },
      params.instructions,
    );
  }

  async function startBridge(slug: string): Promise<void> {
    if (stopped) return;
    if (!config.bridgeMode) {
      throw new Error("Bridge mode is required for live session bootstrap.");
    }
    if (activeSlug !== slug) return;
    await stopBridge();
    const abort = new AbortController();
    bridgeAbort = abort;
    const instructions = buildBridgeInstructions(config.bridgeMode);
    const sessionBriefing = await buildInitialSessionBriefing({ slug, instructions });
    const bridgeConfig = {
      slug,
      sessionBriefing,
      sendMessage: sendOnChannel,
      onDeliveryUpdate: ({
        channel,
        messageId,
        stage,
        error,
      }: {
        channel: string;
        messageId: string;
        stage: "confirmed" | "failed";
        error?: string;
      }) => {
        emitDeliveryStatus({ channel, messageId, stage, error });
      },
      debugLog,
      instructions,
    };
    const runner =
      config.bridgeMode === "claude-sdk"
        ? await createClaudeSdkBridgeRunner(bridgeConfig, abort.signal)
        : config.bridgeMode === "claude-code"
          ? await createClaudeCodeBridgeRunner(bridgeConfig, abort.signal)
          : await createOpenClawBridgeRunner(bridgeConfig);

    if (stopped || activeSlug !== slug || abort.signal.aborted) {
      await runner.stop();
      return;
    }
    bridgeRunner = runner;
  }

  async function ensureBridgePrimed(): Promise<void> {
    if (stopped || !browserConnected || bridgePrimed || bridgePriming || !activeSlug) return;
    const slug = activeSlug;

    const primePromise = (async () => {
      try {
        await startBridge(slug);
        if (stopped || !browserConnected || activeSlug !== slug) return;
        bridgePrimed = true;
        debugLog(`bridge primed for "${slug}"`);
      } catch (error) {
        bridgePrimed = false;
        markError(`failed to prime bridge session for "${slug}"`, error);
      } finally {
        bridgePriming = null;
      }
    })();

    bridgePriming = primePromise;
    await primePromise;
  }

  async function stopBridge(): Promise<void> {
    bridgePrimed = false;
    bridgePriming = null;
    if (bridgeAbort) {
      bridgeAbort.abort();
      bridgeAbort = null;
    }
    if (bridgeRunner) {
      await bridgeRunner.stop();
      bridgeRunner = null;
    }
  }

  // -- Cleanup & shutdown ---------------------------------------------------

  async function cleanup(): Promise<void> {
    if (stopped) return;
    stopped = true;

    clearLocalCandidateTimers();
    clearHealthCheckTimer();
    clearHeartbeatTimer();
    stopPingPong();
    await signaling.stop();

    try {
      await apiClient.goOffline({ daemonSessionId });
    } catch (error) {
      debugLog("failed to go offline", error);
    }

    await stopBridge();
    commandHandler.stop();
    closeCurrentPeer();
    ipcServer.close();

    try {
      fs.unlinkSync(socketPath);
    } catch (error) {
      debugLog("failed to remove daemon socket during cleanup", error);
    }
    try {
      fs.unlinkSync(infoPath);
    } catch (error) {
      debugLog("failed to remove daemon info file during cleanup", error);
    }
  }

  let shuttingDown = false;

  async function shutdown(exitCode = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    await cleanup();
    process.exit(exitCode);
  }

  process.on("SIGTERM", () => {
    void shutdown(0);
  });
  process.on("SIGINT", () => {
    void shutdown(0);
  });
  process.on("uncaughtException", (error) => {
    markError("uncaught exception in daemon", error);
    void shutdown(1);
  });
  process.on("unhandledRejection", (reason) => {
    markError("unhandled rejection in daemon", reason);
    void shutdown(1);
  });
}
