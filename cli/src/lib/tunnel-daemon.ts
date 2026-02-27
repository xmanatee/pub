/**
 * Tunnel daemon — background process that holds a WebRTC PeerConnection.
 */

import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import type { DataChannel, PeerConnection } from "node-datachannel";
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
import { TunnelApiClient } from "../lib/tunnel-api.js";

interface ChannelBuffer {
  messages: Array<{ channel: string; msg: BridgeMessage; timestamp: number }>;
}

interface DaemonConfig {
  tunnelId: string;
  apiClient: TunnelApiClient;
  socketPath: string;
  infoPath: string;
}

const OFFER_TIMEOUT_MS = 10_000;
const SIGNAL_POLL_WAITING_MS = 500;
const SIGNAL_POLL_CONNECTED_MS = 2_000;
const RECOVERY_DELAY_MS = 1_000;
const WRITE_ACK_TIMEOUT_MS = 5_000;

const NOT_CONNECTED_WRITE_ERROR =
  "No browser connected. Ask the user to open the tunnel URL first, then retry.";

export function getTunnelWriteReadinessError(isConnected: boolean): string | null {
  return isConnected ? null : NOT_CONNECTED_WRITE_ERROR;
}

export async function startDaemon(config: DaemonConfig): Promise<void> {
  const { tunnelId, apiClient, socketPath, infoPath } = config;

  const ndc = await import("node-datachannel");

  const buffer: ChannelBuffer = { messages: [] };
  const startTime = Date.now();

  let stopped = false;
  let connected = false;
  let recovering = false;

  let remoteDescriptionApplied = false;
  let lastBrowserCandidateCount = 0;
  let lastSentCandidateCount = 0;

  const pendingRemoteCandidates: Array<{ candidate: string; sdpMid: string }> = [];
  const localCandidates: string[] = [];
  const pendingDeliveryAcks = new Map<
    string,
    { resolve: (received: boolean) => void; timeout: ReturnType<typeof setTimeout> }
  >();

  let peer: PeerConnection | null = null;
  let channels = new Map<string, DataChannel>();
  let pendingInboundBinaryMeta = new Map<string, BridgeMessage>();

  let pollingTimer: ReturnType<typeof setTimeout> | null = null;
  let localCandidateInterval: ReturnType<typeof setInterval> | null = null;
  let localCandidateStopTimer: ReturnType<typeof setTimeout> | null = null;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

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

  function clearRecoveryTimer(): void {
    if (recoveryTimer) {
      clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }
  }

  function setupChannel(name: string, dc: DataChannel): void {
    channels.set(name, dc);

    dc.onMessage((data: string | Buffer) => {
      if (typeof data === "string") {
        const msg = decodeMessage(data);
        if (!msg) return;
        const ack = parseAckMessage(msg);
        if (name === CONTROL_CHANNEL && ack) {
          settlePendingAck(ack.messageId, true);
          return;
        }
        if (msg.type === "binary" && !msg.data) {
          pendingInboundBinaryMeta.set(name, msg);
          return;
        }
        if (shouldAcknowledgeMessage(name, msg)) {
          sendAck(msg.id, name);
        }
        buffer.messages.push({ channel: name, msg, timestamp: Date.now() });
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
        sendAck(binMsg.id, name);
      }
      buffer.messages.push({ channel: name, msg: binMsg, timestamp: Date.now() });
    });
  }

  function sendAck(messageId: string, channel: string): void {
    const controlDc = channels.get(CONTROL_CHANNEL);
    if (!controlDc || !controlDc.isOpen()) return;
    controlDc.sendMessage(encodeMessage(makeAckMessage(messageId, channel)));
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

  function resetNegotiationState(): void {
    connected = false;
    failPendingAcks();
    remoteDescriptionApplied = false;
    lastBrowserCandidateCount = 0;
    lastSentCandidateCount = 0;
    pendingRemoteCandidates.length = 0;
    localCandidates.length = 0;
    clearLocalCandidateTimers();
  }

  function startLocalCandidateFlush(): void {
    clearLocalCandidateTimers();

    localCandidateInterval = setInterval(async () => {
      if (localCandidates.length <= lastSentCandidateCount) return;
      const newOnes = localCandidates.slice(lastSentCandidateCount);
      lastSentCandidateCount = localCandidates.length;
      await apiClient.signal(tunnelId, { candidates: newOnes }).catch(() => {});
    }, 500);

    localCandidateStopTimer = setTimeout(() => {
      clearLocalCandidateTimers();
    }, 30_000);
  }

  function attachPeerHandlers(currentPeer: PeerConnection): void {
    currentPeer.onLocalCandidate((candidate: string, mid: string) => {
      if (stopped || currentPeer !== peer) return;
      localCandidates.push(JSON.stringify({ candidate, sdpMid: mid }));
    });

    currentPeer.onStateChange((state: string) => {
      if (stopped || currentPeer !== peer) return;

      if (state === "connected") {
        connected = true;
        return;
      }

      if (state === "disconnected" || state === "failed" || state === "closed") {
        connected = false;
        scheduleRecovery();
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

    openDataChannel(CONTROL_CHANNEL);
    openDataChannel(CHANNELS.CHAT);
    openDataChannel(CHANNELS.CANVAS);
  }

  function closeCurrentPeer(): void {
    failPendingAcks();

    for (const dc of channels.values()) {
      try {
        dc.close();
      } catch {
        // Ignore close errors while tearing down.
      }
    }

    channels.clear();
    pendingInboundBinaryMeta.clear();

    if (peer) {
      try {
        peer.close();
      } catch {
        // Ignore close errors while tearing down.
      }
      peer = null;
    }
  }

  function scheduleNextPoll(delayMs: number): void {
    if (stopped) return;
    clearPollingTimer();
    pollingTimer = setTimeout(() => {
      void runPollingLoop();
    }, delayMs);
  }

  async function pollSignalingOnce(): Promise<void> {
    const tunnel = await apiClient.get(tunnelId);

    if (tunnel.browserAnswer && !remoteDescriptionApplied) {
      if (!peer) return;

      try {
        const answer = JSON.parse(tunnel.browserAnswer);
        peer.setRemoteDescription(answer.sdp, answer.type);
        remoteDescriptionApplied = true;

        while (pendingRemoteCandidates.length > 0) {
          const next = pendingRemoteCandidates.shift();
          if (!next) break;
          try {
            peer.addRemoteCandidate(next.candidate, next.sdpMid);
          } catch {
            // Ignore malformed/stale candidates and continue.
          }
        }
      } catch {
        // Retry next poll; answer can be stale or temporarily invalid.
      }
    }

    if (tunnel.browserCandidates.length > lastBrowserCandidateCount) {
      const newCandidates = tunnel.browserCandidates.slice(lastBrowserCandidateCount);
      lastBrowserCandidateCount = tunnel.browserCandidates.length;

      for (const c of newCandidates) {
        try {
          const parsed = JSON.parse(c);
          if (typeof parsed.candidate !== "string") continue;
          const sdpMid = typeof parsed.sdpMid === "string" ? parsed.sdpMid : "0";

          if (!remoteDescriptionApplied) {
            pendingRemoteCandidates.push({ candidate: parsed.candidate, sdpMid });
            continue;
          }

          if (!peer) continue;
          peer.addRemoteCandidate(parsed.candidate, sdpMid);
        } catch {
          // Ignore malformed candidates and keep processing others.
        }
      }
    }
  }

  async function runPollingLoop(): Promise<void> {
    if (stopped) return;

    try {
      await pollSignalingOnce();
    } catch {
      // Poll failures are transient; keep retrying.
    }

    scheduleNextPoll(remoteDescriptionApplied ? SIGNAL_POLL_CONNECTED_MS : SIGNAL_POLL_WAITING_MS);
  }

  async function runNegotiationCycle(): Promise<void> {
    if (!peer) throw new Error("PeerConnection not initialized");

    resetNegotiationState();
    const offer = await generateOffer(peer, OFFER_TIMEOUT_MS);
    await apiClient.signal(tunnelId, { offer });
    startLocalCandidateFlush();
  }

  async function recoverPeer(): Promise<void> {
    if (stopped || recovering) return;
    recovering = true;

    try {
      closeCurrentPeer();
      createPeer();
      await runNegotiationCycle();
    } finally {
      recovering = false;
    }
  }

  function scheduleRecovery(delayMs = RECOVERY_DELAY_MS): void {
    if (stopped || recovering || recoveryTimer) return;

    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      if (stopped || connected) return;
      void recoverPeer().catch(() => {
        if (!stopped) scheduleRecovery(delayMs);
      });
    }, delayMs);
  }

  if (fs.existsSync(socketPath)) {
    let stale = true;
    try {
      const raw = fs.readFileSync(infoPath, "utf-8");
      const info = JSON.parse(raw) as { pid: number };
      process.kill(info.pid, 0);
      stale = false;
    } catch {
      stale = true;
    }

    if (stale) {
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // Ignore stale socket unlink failures.
      }
    } else {
      throw new Error(`Daemon already running (socket: ${socketPath})`);
    }
  }

  createPeer();

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
        .catch((err) => conn.write(`${JSON.stringify({ ok: false, error: String(err) })}\n`));
    });
  });

  ipcServer.listen(socketPath);

  const infoDir = path.dirname(infoPath);
  if (!fs.existsSync(infoDir)) fs.mkdirSync(infoDir, { recursive: true });
  fs.writeFileSync(
    infoPath,
    JSON.stringify({ pid: process.pid, tunnelId, socketPath, startedAt: startTime }),
  );

  scheduleNextPoll(0);

  try {
    await runNegotiationCycle();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await cleanup();
    throw new Error(`Failed to generate WebRTC offer: ${message}`);
  }

  async function cleanup(): Promise<void> {
    if (stopped) return;
    stopped = true;

    clearPollingTimer();
    clearLocalCandidateTimers();
    clearRecoveryTimer();
    closeCurrentPeer();

    ipcServer.close();

    try {
      fs.unlinkSync(socketPath);
    } catch {
      // Ignore socket cleanup errors.
    }

    try {
      fs.unlinkSync(infoPath);
    } catch {
      // Ignore info cleanup errors.
    }

    await apiClient.close(tunnelId).catch(() => {});
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

  async function handleIpcRequest(req: {
    method: string;
    params: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    switch (req.method) {
      case "write": {
        const channel = (req.params.channel as string) || CHANNELS.CHAT;
        const readinessError = getTunnelWriteReadinessError(connected);
        if (readinessError) return { ok: false, error: readinessError };

        const msg = req.params.msg as BridgeMessage;
        const binaryBase64 =
          typeof req.params.binaryBase64 === "string"
            ? (req.params.binaryBase64 as string)
            : undefined;

        let targetDc = channels.get(channel);
        if (!targetDc) targetDc = openDataChannel(channel);

        try {
          await waitForChannelOpen(targetDc);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, error: `Channel "${channel}" not open: ${message}` };
        }

        const waitForAck = shouldAcknowledgeMessage(channel, msg)
          ? waitForDeliveryAck(msg.id, WRITE_ACK_TIMEOUT_MS)
          : null;

        try {
          if (msg.type === "binary" && binaryBase64) {
            const payload = Buffer.from(binaryBase64, "base64");
            targetDc.sendMessage(
              encodeMessage({
                ...msg,
                meta: {
                  ...(msg.meta || {}),
                  size: payload.length,
                },
              }),
            );
            targetDc.sendMessageBinary(payload);
          } else {
            targetDc.sendMessage(encodeMessage(msg));
          }
        } catch (error) {
          if (waitForAck) settlePendingAck(msg.id, false);
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, error: `Failed to send on channel "${channel}": ${message}` };
        }

        if (waitForAck) {
          const acked = await waitForAck;
          if (!acked) {
            return {
              ok: false,
              error: `Delivery not confirmed for message ${msg.id} within ${WRITE_ACK_TIMEOUT_MS}ms.`,
            };
          }
        }

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
          uptime: Math.floor((Date.now() - startTime) / 1000),
          channels: [...channels.keys()],
          bufferedMessages: buffer.messages.length,
        };
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

function generateOffer(peer: PeerConnection, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let resolved = false;
    const done = (sdp: string, type: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(JSON.stringify({ sdp, type }));
    };

    peer.onLocalDescription((sdp: string, type: string) => {
      done(sdp, type);
    });

    peer.onGatheringStateChange((state: string) => {
      if (state === "complete" && !resolved) {
        const desc = peer.localDescription();
        if (desc) done(desc.sdp, desc.type);
      }
    });

    const timeout = setTimeout(() => {
      if (resolved) return;
      const desc = peer.localDescription();
      if (desc) {
        done(desc.sdp, desc.type);
      } else {
        resolved = true;
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    peer.setLocalDescription();
  });
}
