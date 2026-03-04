/**
 * Agent daemon — background process that holds a WebRTC PeerConnection.
 *
 * Per-user (not per-slug). Registers presence online, polls for incoming
 * live requests (browser offers), and responds with answers.
 */

import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import type { DataChannel, PeerConnection } from "node-datachannel";
import { latestCliVersionPath, readLatestCliVersion } from "../commands/live-helpers.js";
import {
  type BridgeMessage,
  CHANNELS,
  CONTROL_CHANNEL,
  decodeMessage,
  encodeMessage,
  makeAckMessage,
  parseAckMessage,
  shouldAcknowledgeMessage,
} from "../lib/bridge-protocol.js";
import { resolveAckChannel } from "./ack-routing.js";
import { PubApiError } from "./api.js";
import { errorMessage } from "./cli-error.js";
import { createClaudeCodeBridgeRunner } from "./live-bridge-claude-code.js";
import { type BridgeRunner, createOpenClawBridgeRunner } from "./live-bridge-openclaw.js";
import { createAnswer } from "./live-daemon-answer.js";
import {
  type ChannelBuffer,
  type DaemonConfig,
  getLiveWriteReadinessError,
  getSignalPollDelayMs,
  getStickyCanvasHtml,
  LOCAL_CANDIDATE_FLUSH_MS,
  OFFER_TIMEOUT_MS,
  shouldRecoverForBrowserOfferChange,
  WRITE_ACK_TIMEOUT_MS,
} from "./live-daemon-shared.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const PERSIST_TIMEOUT_MS = 3_000;

export async function startDaemon(config: DaemonConfig): Promise<void> {
  const { apiClient, socketPath, infoPath, cliVersion, agentName } = config;

  const ndc = await import("node-datachannel");

  const buffer: ChannelBuffer = { messages: [] };
  const startTime = Date.now();

  let stopped = false;
  let connected = false;
  let recovering = false;
  let activeSlug: string | null = null;

  let lastAppliedBrowserOffer: string | null = null;
  let lastBrowserCandidateCount = 0;
  let lastSentCandidateCount = 0;

  const localCandidates: string[] = [];
  const stickyOutboundByChannel = new Map<string, BridgeMessage>();
  const pendingOutboundAcks = new Map<string, { channel: string; messageId: string }>();
  const pendingDeliveryAcks = new Map<
    string,
    { resolve: (received: boolean) => void; timeout: ReturnType<typeof setTimeout> }
  >();

  let peer: PeerConnection | null = null;
  let channels = new Map<string, DataChannel>();
  let pendingInboundBinaryMeta = new Map<string, BridgeMessage>();

  let pollingTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let localCandidateInterval: ReturnType<typeof setInterval> | null = null;
  let localCandidateStopTimer: ReturnType<typeof setTimeout> | null = null;
  let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  let lastError: string | null = null;
  const debugEnabled = process.env.PUBBLUE_LIVE_DEBUG === "1";
  const versionFilePath = latestCliVersionPath();
  let bridgeRunner: BridgeRunner | null = null;

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

  function clearPollingTimer(): void {
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = null;
    }
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

  function runHealthCheck(): void {
    if (stopped) return;
    if (cliVersion) {
      const latest = readLatestCliVersion(versionFilePath);
      if (latest && latest !== cliVersion) {
        markError(`detected CLI upgrade (${cliVersion} → ${latest}); shutting down`);
        void shutdown();
      }
    }
  }

  function startHealthCheckTimer(): void {
    clearHealthCheckTimer();
    healthCheckTimer = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL_MS);
    runHealthCheck();
  }

  // -- Channel / message management -----------------------------------------

  function setupChannel(name: string, dc: DataChannel): void {
    channels.set(name, dc);
    dc.onOpen(() => {
      if (name === CONTROL_CHANNEL) flushQueuedAcks();
    });

    dc.onMessage((data: string | Buffer) => {
      if (typeof data === "string") {
        const msg = decodeMessage(data);
        if (!msg) return;
        const ack = parseAckMessage(msg);
        if (ack) {
          settlePendingAck(ack.messageId, true);
          return;
        }
        if (msg.type === "binary" && !msg.data) {
          pendingInboundBinaryMeta.set(name, msg);
          return;
        }
        if (shouldAcknowledgeMessage(name, msg)) {
          queueAck(msg.id, name);
        }
        buffer.messages.push({ channel: name, msg, timestamp: Date.now() });
        bridgeRunner?.enqueue([{ channel: name, msg }]);
        return;
      }

      const pendingMeta = pendingInboundBinaryMeta.get(name);
      if (pendingMeta) pendingInboundBinaryMeta.delete(name);
      const binMsg: BridgeMessage = pendingMeta
        ? {
            id: pendingMeta.id,
            type: "binary",
            data: data.toString("base64"),
            meta: { ...pendingMeta.meta, size: data.length },
          }
        : {
            id: `bin-${Date.now()}`,
            type: "binary",
            data: data.toString("base64"),
            meta: { size: data.length },
          };
      if (shouldAcknowledgeMessage(name, binMsg)) {
        queueAck(binMsg.id, name);
      }
      buffer.messages.push({ channel: name, msg: binMsg, timestamp: Date.now() });
      bridgeRunner?.enqueue([{ channel: name, msg: binMsg }]);
    });
  }

  function getAckKey(messageId: string, channel: string): string {
    return `${channel}:${messageId}`;
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

  function waitForDeliveryAck(messageId: string, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        pendingDeliveryAcks.delete(messageId);
        resolve(false);
      }, timeoutMs);
      pendingDeliveryAcks.set(messageId, { resolve, timeout });
    });
  }

  function settlePendingAck(messageId: string, received: boolean): void {
    const pending = pendingDeliveryAcks.get(messageId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingDeliveryAcks.delete(messageId);
    pending.resolve(received);
  }

  function failPendingAcks(): void {
    for (const [messageId, pending] of pendingDeliveryAcks) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
      pendingDeliveryAcks.delete(messageId);
    }
  }

  function openDataChannel(name: string): DataChannel {
    if (!peer) throw new Error("PeerConnection not initialized");
    const existing = channels.get(name);
    if (existing) return existing;
    const dc = peer.createDataChannel(name, { ordered: true });
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

  function maybePersistStickyOutbound(channel: string, msg: BridgeMessage): void {
    if (channel !== CHANNELS.CANVAS) return;
    if (msg.type === "event" && msg.data === "hide") {
      stickyOutboundByChannel.delete(channel);
      return;
    }
    if (msg.type !== "html") return;
    stickyOutboundByChannel.set(channel, {
      ...msg,
      meta: msg.meta ? { ...msg.meta } : undefined,
    });
  }

  async function replayStickyOutboundMessages(): Promise<void> {
    if (!connected || recovering || stopped) return;
    for (const [channel, msg] of stickyOutboundByChannel) {
      try {
        let targetDc = channels.get(channel);
        if (!targetDc) targetDc = openDataChannel(channel);
        await waitForChannelOpen(targetDc, 3_000);
        targetDc.sendMessage(encodeMessage(msg));
      } catch (error) {
        debugLog(`sticky outbound replay failed for channel ${channel}`, error);
      }
    }
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
        connected = true;
        flushQueuedAcks();
        void replayStickyOutboundMessages();
        return;
      }
      if (state === "disconnected" || state === "failed" || state === "closed") {
        const wasConnected = connected;
        connected = false;
        if (wasConnected) void persistCanvasContent();
      }
    });

    currentPeer.onDataChannel((dc: DataChannel) => {
      if (stopped || currentPeer !== peer) return;
      setupChannel(dc.getLabel(), dc);
    });
  }

  function createPeer(): void {
    const nextPeer: PeerConnection = new ndc.PeerConnection("agent", {
      iceServers: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
    });
    peer = nextPeer;
    channels = new Map<string, DataChannel>();
    pendingInboundBinaryMeta = new Map<string, BridgeMessage>();
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
    connected = false;
    failPendingAcks();
    lastAppliedBrowserOffer = null;
    lastBrowserCandidateCount = 0;
    lastSentCandidateCount = 0;
    localCandidates.length = 0;
    clearLocalCandidateTimers();
  }

  function startLocalCandidateFlush(slug: string): void {
    clearLocalCandidateTimers();
    localCandidateInterval = setInterval(async () => {
      if (localCandidates.length <= lastSentCandidateCount) return;
      const newOnes = localCandidates.slice(lastSentCandidateCount);
      lastSentCandidateCount = localCandidates.length;
      await apiClient.signalAnswer({ slug, candidates: newOnes }).catch((error) => {
        debugLog("failed to publish local ICE candidates", error);
      });
    }, LOCAL_CANDIDATE_FLUSH_MS);

    localCandidateStopTimer = setTimeout(() => {
      clearLocalCandidateTimers();
    }, 30_000);
  }

  // -- Answer incoming live request -----------------------------------------

  async function handleIncomingLive(slug: string, browserOffer: string): Promise<void> {
    if (recovering) return;
    recovering = true;

    try {
      await persistCanvasContent();
      await stopBridge();
      closeCurrentPeer();
      createPeer();
      resetNegotiationState();

      if (!peer) throw new Error("PeerConnection not initialized");

      const answer = await createAnswer(peer, browserOffer, OFFER_TIMEOUT_MS);
      lastAppliedBrowserOffer = browserOffer;
      activeSlug = slug;

      await apiClient.signalAnswer({ slug, answer, agentName });
      startLocalCandidateFlush(slug);
      void startBridge();
    } catch (error) {
      markError("failed to handle incoming live request", error);
    } finally {
      recovering = false;
    }
  }

  // -- Polling loop ---------------------------------------------------------

  function scheduleNextPoll(delayMs: number): void {
    if (stopped) return;
    clearPollingTimer();
    pollingTimer = setTimeout(() => {
      void runPollingLoop();
    }, delayMs);
  }

  async function pollSignalingOnce(): Promise<void> {
    const live = await apiClient.getPendingLive();

    if (!live) {
      return;
    }

    if (live.browserOffer && !live.agentAnswer) {
      if (
        shouldRecoverForBrowserOfferChange({
          incomingBrowserOffer: live.browserOffer,
          lastAppliedBrowserOffer,
        }) ||
        !lastAppliedBrowserOffer
      ) {
        await handleIncomingLive(live.slug, live.browserOffer);
        return;
      }
    }

    if (live.browserOffer && live.agentAnswer && live.slug === activeSlug) {
      if (live.browserCandidates.length > lastBrowserCandidateCount) {
        const newCandidates = live.browserCandidates.slice(lastBrowserCandidateCount);
        lastBrowserCandidateCount = live.browserCandidates.length;

        for (const c of newCandidates) {
          try {
            const parsed = JSON.parse(c);
            if (typeof parsed.candidate !== "string") continue;
            const sdpMid = typeof parsed.sdpMid === "string" ? parsed.sdpMid : "0";
            if (!peer) continue;
            peer.addRemoteCandidate(parsed.candidate, sdpMid);
          } catch (error) {
            debugLog("failed to parse/apply browser ICE candidate", error);
          }
        }
      }
    }
  }

  async function runPollingLoop(): Promise<void> {
    if (stopped) return;

    let retryAfterSeconds: number | undefined;
    try {
      await pollSignalingOnce();
    } catch (error) {
      if (error instanceof PubApiError && error.status === 429) {
        retryAfterSeconds = error.retryAfterSeconds;
      }
      markError("signaling poll failed", error);
    }

    const baseDelay = getSignalPollDelayMs({
      hasActiveConnection: connected,
      retryAfterSeconds,
    });
    scheduleNextPoll(baseDelay);
  }

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

  await apiClient.goOnline();

  heartbeatTimer = setInterval(async () => {
    if (stopped) return;
    try {
      await apiClient.heartbeat();
    } catch (error) {
      markError("heartbeat failed", error);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // -- IPC server -----------------------------------------------------------

  const ipcServer = net.createServer((conn) => {
    let data = "";
    conn.on("data", (chunk) => {
      data += chunk.toString();
      const newlineIdx = data.indexOf("\n");
      if (newlineIdx === -1) return;

      const line = data.slice(0, newlineIdx);
      data = data.slice(newlineIdx + 1);

      let request: { method: string; params: Record<string, unknown> };
      try {
        request = JSON.parse(line);
      } catch {
        conn.write(`${JSON.stringify({ ok: false, error: "Invalid JSON" })}\n`);
        return;
      }

      handleIpcRequest(request)
        .then((response) => conn.write(`${JSON.stringify(response)}\n`))
        .catch((err) => conn.write(`${JSON.stringify({ ok: false, error: errorMessage(err) })}\n`));
    });
  });

  ipcServer.listen(socketPath);

  const infoDir = path.dirname(infoPath);
  if (!fs.existsSync(infoDir)) fs.mkdirSync(infoDir, { recursive: true });
  fs.writeFileSync(
    infoPath,
    JSON.stringify({ pid: process.pid, socketPath, startedAt: startTime, cliVersion }),
  );

  startHealthCheckTimer();
  scheduleNextPoll(0);

  // -- In-process bridge runner ---------------------------------------------

  function sendOnChannel(channel: string, msg: BridgeMessage): void {
    if (stopped || !connected) return;
    let targetDc = channels.get(channel);
    if (!targetDc) {
      try {
        targetDc = openDataChannel(channel);
      } catch (error) {
        debugLog(`bridge sendOnChannel: failed to open channel ${channel}`, error);
        return;
      }
    }
    try {
      if (targetDc.isOpen()) {
        targetDc.sendMessage(encodeMessage(msg));
      }
    } catch (error) {
      debugLog(`bridge sendOnChannel failed for ${channel}`, error);
    }
  }

  async function startBridge(): Promise<void> {
    if (stopped || !activeSlug) return;
    if (!config.bridgeMode) return;
    await stopBridge();
    const bridgeConfig = { slug: activeSlug, sendMessage: sendOnChannel, debugLog };
    try {
      bridgeRunner =
        config.bridgeMode === "claude-code"
          ? await createClaudeCodeBridgeRunner(bridgeConfig)
          : await createOpenClawBridgeRunner(bridgeConfig);
    } catch (error) {
      markError("bridge runner failed to start", error);
    }
  }

  async function stopBridge(): Promise<void> {
    if (bridgeRunner) {
      await bridgeRunner.stop();
      bridgeRunner = null;
    }
  }

  // -- Canvas persistence ---------------------------------------------------

  async function persistCanvasContent(): Promise<void> {
    if (!activeSlug) return;
    const html = getStickyCanvasHtml(stickyOutboundByChannel, CHANNELS.CANVAS);
    if (!html) return;
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("persist timeout")), PERSIST_TIMEOUT_MS),
      );
      await Promise.race([
        apiClient.update({ slug: activeSlug, content: html, filename: "canvas.html" }),
        timeout,
      ]);
    } catch (error) {
      debugLog("failed to persist canvas content", error);
    }
  }

  // -- Cleanup & shutdown ---------------------------------------------------

  async function cleanup(): Promise<void> {
    if (stopped) return;
    stopped = true;

    clearPollingTimer();
    clearLocalCandidateTimers();
    clearHealthCheckTimer();
    clearHeartbeatTimer();

    try {
      await apiClient.goOffline();
    } catch (error) {
      debugLog("failed to go offline", error);
    }

    await persistCanvasContent();
    await stopBridge();
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

  async function shutdown(): Promise<void> {
    await cleanup();
    process.exit(0);
  }

  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });

  // -- IPC handler ----------------------------------------------------------

  async function handleIpcRequest(req: {
    method: string;
    params: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    switch (req.method) {
      case "write": {
        const channel = (req.params.channel as string) || CHANNELS.CHAT;
        const readinessError = getLiveWriteReadinessError(connected);
        if (readinessError) return { ok: false, error: readinessError };

        const msg = req.params.msg as BridgeMessage;
        const binaryBase64 =
          typeof req.params.binaryBase64 === "string" ? req.params.binaryBase64 : undefined;
        const binaryPayload =
          msg.type === "binary" && binaryBase64 ? Buffer.from(binaryBase64, "base64") : undefined;

        let targetDc = channels.get(channel);
        if (!targetDc) targetDc = openDataChannel(channel);

        try {
          await waitForChannelOpen(targetDc);
        } catch (error) {
          markError(`channel "${channel}" failed to open`, error);
          return { ok: false, error: `Channel "${channel}" not open: ${errorMessage(error)}` };
        }

        const waitForAck = shouldAcknowledgeMessage(channel, msg)
          ? waitForDeliveryAck(msg.id, WRITE_ACK_TIMEOUT_MS)
          : null;

        try {
          if (msg.type === "binary" && binaryPayload) {
            targetDc.sendMessage(
              encodeMessage({
                ...msg,
                meta: { ...(msg.meta || {}), size: binaryPayload.length },
              }),
            );
            targetDc.sendMessageBinary(binaryPayload);
          } else {
            targetDc.sendMessage(encodeMessage(msg));
          }
        } catch (error) {
          if (waitForAck) settlePendingAck(msg.id, false);
          markError(`failed to send message on channel "${channel}"`, error);
          return {
            ok: false,
            error: `Failed to send on channel "${channel}": ${errorMessage(error)}`,
          };
        }

        if (waitForAck) {
          const acked = await waitForAck;
          if (!acked) {
            markError(`delivery ack timeout for message ${msg.id}`);
            return {
              ok: false,
              error: `Delivery not confirmed for message ${msg.id} within ${WRITE_ACK_TIMEOUT_MS}ms.`,
            };
          }
        }

        maybePersistStickyOutbound(channel, msg);
        return { ok: true, delivered: true };
      }

      case "read": {
        const channel = req.params.channel as string | undefined;
        let msgs: ChannelBuffer["messages"];
        if (channel) {
          msgs = buffer.messages.filter((m) => m.channel === channel);
          buffer.messages = buffer.messages.filter((m) => m.channel !== channel);
        } else {
          msgs = [...buffer.messages];
          buffer.messages = [];
        }
        return { ok: true, messages: msgs };
      }

      case "channels": {
        const chList = [...channels.keys()].map((name) => ({ name, direction: "bidi" }));
        return { ok: true, channels: chList };
      }

      case "status": {
        return {
          ok: true,
          connected,
          activeSlug,
          uptime: Math.floor((Date.now() - startTime) / 1000),
          channels: [...channels.keys()],
          bufferedMessages: buffer.messages.length,
          lastError,
          bridge: bridgeRunner?.status() ?? null,
        };
      }

      case "active-slug": {
        return { ok: true, slug: activeSlug };
      }

      case "close": {
        void shutdown();
        return { ok: true };
      }

      default:
        return { ok: false, error: `Unknown method: ${req.method}` };
    }
  }
}
