/**
 * Tunnel daemon — background process that holds a WebRTC PeerConnection.
 *
 * Responsibilities:
 * - Listen on Unix socket for IPC commands from CLI (started FIRST for discoverability)
 * - Create WebRTC offer and send to Convex via HTTP API
 * - Poll Convex for browser's SDP answer and ICE candidates
 * - Manage named DataChannels (generic bridge)
 * - Buffer incoming messages per channel
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
  let connected = false;
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let lastBrowserCandidateCount = 0;
  let remoteDescriptionApplied = false;
  const pendingRemoteCandidates: Array<{ candidate: string; sdpMid: string }> = [];

  // -- WebRTC setup ----------------------------------------------------------

  const peer: PeerConnection = new ndc.PeerConnection("agent", {
    iceServers: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
  });

  const channels = new Map<string, DataChannel>();
  const pendingInboundBinaryMeta = new Map<string, BridgeMessage>();

  function openDataChannel(name: string): DataChannel {
    const existing = channels.get(name);
    if (existing) return existing;
    const dc = peer.createDataChannel(name, { ordered: true });
    setupChannel(name, dc);
    return dc;
  }

  async function waitForChannelOpen(dc: DataChannel, timeoutMs = 5000): Promise<void> {
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

  function setupChannel(name: string, dc: DataChannel): void {
    channels.set(name, dc);
    dc.onMessage((data: string | Buffer) => {
      if (typeof data === "string") {
        const msg = decodeMessage(data);
        if (msg) {
          if (msg.type === "binary" && !msg.data) {
            pendingInboundBinaryMeta.set(name, msg);
            return;
          }
          buffer.messages.push({ channel: name, msg, timestamp: Date.now() });
        }
      } else {
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
        buffer.messages.push({ channel: name, msg: binMsg, timestamp: Date.now() });
      }
    });
  }

  openDataChannel(CONTROL_CHANNEL);
  openDataChannel(CHANNELS.CHAT);
  openDataChannel(CHANNELS.CANVAS);

  const localCandidates: string[] = [];
  peer.onLocalCandidate((candidate: string, mid: string) => {
    localCandidates.push(JSON.stringify({ candidate, sdpMid: mid }));
  });

  peer.onStateChange((state: string) => {
    if (state === "connected") {
      connected = true;
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    } else if (state === "disconnected" || state === "failed") {
      connected = false;
    }
  });

  peer.onDataChannel((dc: DataChannel) => {
    setupChannel(dc.getLabel(), dc);
  });

  // -- IPC server (Unix socket) — started BEFORE offer for discoverability ---

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
        /* ok */
      }
    } else {
      throw new Error(`Daemon already running (socket: ${socketPath})`);
    }
  }

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

  // Write daemon info so parent process can verify readiness
  const infoDir = path.dirname(infoPath);
  if (!fs.existsSync(infoDir)) fs.mkdirSync(infoDir, { recursive: true });
  fs.writeFileSync(
    infoPath,
    JSON.stringify({ pid: process.pid, tunnelId, socketPath, startedAt: startTime }),
  );

  // -- Cleanup + shutdown ----------------------------------------------------

  async function cleanup(): Promise<void> {
    if (pollingInterval) clearInterval(pollingInterval);
    for (const dc of channels.values()) dc.close();
    peer.close();
    ipcServer.close();
    try {
      fs.unlinkSync(socketPath);
    } catch {
      /* ok */
    }
    try {
      fs.unlinkSync(infoPath);
    } catch {
      /* ok */
    }
    await apiClient.close(tunnelId).catch(() => {});
  }

  async function shutdown(): Promise<void> {
    await cleanup();
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  // -- Generate offer --------------------------------------------------------

  let offer: string;
  try {
    offer = await generateOffer(peer, OFFER_TIMEOUT_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await cleanup();
    throw new Error(`Failed to generate WebRTC offer: ${message}`);
  }

  await apiClient.signal(tunnelId, { offer });

  // -- ICE candidate flushing ------------------------------------------------

  setTimeout(async () => {
    if (localCandidates.length > 0) {
      await apiClient.signal(tunnelId, { candidates: localCandidates }).catch(() => {});
    }
  }, 1000);

  let lastSentCandidateCount = 0;
  const candidateInterval = setInterval(async () => {
    if (localCandidates.length > lastSentCandidateCount) {
      const newOnes = localCandidates.slice(lastSentCandidateCount);
      lastSentCandidateCount = localCandidates.length;
      await apiClient.signal(tunnelId, { candidates: newOnes }).catch(() => {});
    }
  }, 500);
  setTimeout(() => clearInterval(candidateInterval), 30_000);

  // -- Poll for browser answer + ICE candidates ------------------------------

  pollingInterval = setInterval(async () => {
    try {
      const tunnel = await apiClient.get(tunnelId);

      if (tunnel.browserAnswer && !remoteDescriptionApplied) {
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
          // Wait for next poll; answer can be temporarily malformed during updates.
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
            peer.addRemoteCandidate(parsed.candidate, sdpMid);
          } catch {
            // Ignore malformed candidates and keep processing others.
          }
        }
      }
    } catch {
      // Polling failure — retry on next interval.
    }
  }, 500);

  // -- IPC request handler ---------------------------------------------------

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
        const dc = channels.get(channel);
        let targetDc = dc;
        if (!targetDc) {
          const newDc = openDataChannel(channel);
          targetDc = newDc;
        }

        try {
          await waitForChannelOpen(targetDc);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, error: `Channel "${channel}" not open: ${message}` };
        }

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
        return { ok: true };
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
        const chList = [...channels.keys()].map((name) => ({
          name,
          direction: "bidi",
        }));
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

/**
 * Generate a WebRTC offer with robust fallback:
 * 1. Fast path: onLocalDescription callback (works with iceServers: [])
 * 2. Primary path: onGatheringStateChange → localDescription() (works with real STUN)
 * 3. Safety net: hard timeout with last-chance localDescription() read
 */
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
