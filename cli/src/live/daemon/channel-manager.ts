import { resolveAckChannel } from "../../../../shared/ack-routing-core";
import {
  type BridgeMessage,
  CHANNELS,
  CONTROL_CHANNEL,
  decodeMessage,
  encodeMessage,
  generateMessageId,
  makeAckMessage,
  makeDeliveryReceiptMessage,
  parseAckMessage,
  STREAM_ORPHAN_TIMEOUT_MS,
  shouldAcknowledgeMessage,
} from "../../../../shared/bridge-protocol-core";
import { isLiveConnectionReady } from "../../../../shared/live-runtime-state-core";
import { createMessageDedup } from "../../../../shared/message-dedup-core";
import { ORDERED_DATA_CHANNEL_OPTIONS } from "../../../../shared/webrtc-transport-core";
import type { DataChannelLike } from "../transport/webrtc-adapter.js";
import type { DaemonState } from "./state.js";

const DEDUP_MAX_SIZE = 10_000;
const OUTBOUND_SEND_MAX_ATTEMPTS = 2;
const OUTBOUND_ACK_TIMEOUT_MS = 5_000;
const MAX_ACK_FAILURES = 3;
const MAX_PENDING_ACKS = 200;

export function createDaemonChannelManager(params: {
  state: DaemonState;
  debugLog: (message: string, error?: unknown) => void;
  markError: (message: string, error?: unknown) => void;
  onCommandMessage: (msg: BridgeMessage) => Promise<void>;
  onPubFsMessage: (msg: BridgeMessage) => Promise<void>;
  onChannelClosed?: (name: string) => void;
}) {
  const { state, debugLog, markError, onCommandMessage, onPubFsMessage, onChannelClosed } = params;
  const dedup = createMessageDedup(DEDUP_MAX_SIZE);
  let pubFsWriteLane = Promise.resolve();

  function enqueuePubFsWriteLane(msg: BridgeMessage, errorContext: string): void {
    pubFsWriteLane = pubFsWriteLane
      .then(() => onPubFsMessage(msg))
      .catch((error) => {
        markError(errorContext, error);
      });
  }

  function getOpenChannels(name: string): DataChannelLike[] {
    const bucket = state.channels.get(name);
    if (!bucket) return [];
    const open: DataChannelLike[] = [];
    for (const dc of bucket) if (dc.isOpen()) open.push(dc);
    return open;
  }

  function hasOpenChannel(name: string): boolean {
    const bucket = state.channels.get(name);
    if (!bucket) return false;
    for (const dc of bucket) if (dc.isOpen()) return true;
    return false;
  }

  function fanOutSend(dcs: DataChannelLike[], encoded: string, errorContext: string): number {
    let sent = 0;
    for (const dc of dcs) {
      try {
        dc.sendMessage(encoded);
        sent += 1;
      } catch (error) {
        markError(errorContext, error);
      }
    }
    return sent;
  }

  function emitDeliveryStatus(params: {
    channel: string;
    messageId: string;
    stage: "received" | "confirmed" | "failed";
    error?: string;
  }): void {
    if (!params.messageId || params.channel === CONTROL_CHANNEL) return;
    const encoded = encodeMessage(
      makeDeliveryReceiptMessage({
        messageId: params.messageId,
        channel: params.channel,
        stage: params.stage,
        error: params.error,
      }),
    );
    const controlDcs = getOpenChannels(CONTROL_CHANNEL);
    if (controlDcs.length > 0) {
      fanOutSend(controlDcs, encoded, "failed to emit delivery status on _control");
      return;
    }
    fanOutSend(
      getOpenChannels(params.channel),
      encoded,
      `failed to emit delivery status on "${params.channel}"`,
    );
  }

  function getAckKey(messageId: string, channel: string): string {
    return `${channel}:${messageId}`;
  }

  function queueAck(messageId: string, channel: string): void {
    if (state.pendingOutboundAcks.size >= MAX_PENDING_ACKS) {
      const oldestKey = state.pendingOutboundAcks.keys().next().value;
      if (oldestKey) state.pendingOutboundAcks.delete(oldestKey);
    }
    state.pendingOutboundAcks.set(getAckKey(messageId, channel), {
      messageId,
      channel,
      failCount: 0,
    });
    flushQueuedAcks();
  }

  function flushQueuedAcks(): void {
    for (const [ackKey, ack] of state.pendingOutboundAcks) {
      const controlDcs = getOpenChannels(CONTROL_CHANNEL);
      const messageDcs = getOpenChannels(ack.channel);
      const targetChannel = resolveAckChannel({
        controlChannelOpen: controlDcs.length > 0,
        messageChannelOpen: messageDcs.length > 0,
        messageChannel: ack.channel,
      });
      if (!targetChannel) continue;

      const encodedAck = encodeMessage(makeAckMessage(ack.messageId, ack.channel));
      const primaryDcs = targetChannel === CONTROL_CHANNEL ? controlDcs : messageDcs;
      const primarySent = fanOutSend(primaryDcs, encodedAck, "failed to flush queued ack");
      if (primarySent > 0) {
        state.pendingOutboundAcks.delete(ackKey);
        continue;
      }

      const fallbackDcs = targetChannel === CONTROL_CHANNEL ? messageDcs : controlDcs;
      const fallbackSent = fanOutSend(
        fallbackDcs,
        encodedAck,
        "failed to flush queued ack on fallback channel",
      );
      if (fallbackSent > 0) {
        state.pendingOutboundAcks.delete(ackKey);
        continue;
      }

      ack.failCount += 1;
      if (ack.failCount >= MAX_ACK_FAILURES) {
        debugLog(
          `dropping ack for ${ack.channel}:${ack.messageId} after ${MAX_ACK_FAILURES} failures`,
        );
        state.pendingOutboundAcks.delete(ackKey);
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
      const existing = state.pendingDeliveryAcks.get(key);
      if (existing) {
        clearTimeout(existing.timeout);
        state.pendingDeliveryAcks.delete(key);
      }
      const timeout = setTimeout(() => {
        state.pendingDeliveryAcks.delete(key);
        resolve(false);
      }, timeoutMs);
      state.pendingDeliveryAcks.set(key, { resolve, timeout });
    });
  }

  function settlePendingAck(messageId: string, channel: string, received: boolean): void {
    const key = getAckKey(messageId, channel);
    const pending = state.pendingDeliveryAcks.get(key);
    if (!pending) return;
    clearTimeout(pending.timeout);
    state.pendingDeliveryAcks.delete(key);
    pending.resolve(received);
  }

  function failPendingAcks(): void {
    for (const [ackKey, pending] of state.pendingDeliveryAcks) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
      state.pendingDeliveryAcks.delete(ackKey);
    }
  }

  function handleStreamStart(channel: string, streamId: string): void {
    const existing = state.inboundStreams.get(channel);
    if (existing) {
      const elapsed = Date.now() - existing.startedAt;
      debugLog(
        `stream-start on "${channel}" while stream ${existing.streamId} active (${elapsed}ms old)`,
      );
      if (elapsed >= STREAM_ORPHAN_TIMEOUT_MS) {
        emitDeliveryStatus({
          channel,
          messageId: existing.streamId,
          stage: "failed",
          error: "orphaned stream replaced",
        });
      }
    }
    state.inboundStreams.set(channel, { streamId, startedAt: Date.now() });
  }

  function resetMessageDedup(): void {
    dedup.reset();
  }

  function setupChannel(name: string, dc: DataChannelLike, options?: { peerOwned?: boolean }): void {
    let bucket = state.channels.get(name);
    if (!bucket) {
      bucket = new Set();
      state.channels.set(name, bucket);
    }
    bucket.add(dc);
    if (options?.peerOwned) state.peerDataChannels.add(dc);

    dc.onOpen(() => {
      debugLog(`datachannel "${name}" open`);
      if (name === CONTROL_CHANNEL) flushQueuedAcks();
    });

    dc.onClosed(() => {
      const currentBucket = state.channels.get(name);
      if (currentBucket) {
        currentBucket.delete(dc);
        if (currentBucket.size === 0) {
          state.channels.delete(name);
          state.pendingInboundBinaryMeta.delete(name);
          state.inboundStreams.delete(name);
        }
      }
      debugLog(`datachannel "${name}" closed`);
      // When a target-channel DC closes, re-evaluate queued acks so pending
      // acks keyed on this channel can drain via their fallback (_control).
      flushQueuedAcks();
      onChannelClosed?.(name);
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
            if (state.pongTimeout) {
              clearTimeout(state.pongTimeout);
              state.pongTimeout = null;
            }
            return;
          }
          if (dedup.isDuplicate(`${name}:${msg.id}`)) {
            if (msg.type === "binary" && !msg.data) {
              state.pendingInboundBinaryMeta.set(name, msg);
              return;
            }
            if (shouldAcknowledgeMessage(name, msg)) {
              queueAck(msg.id, name);
            }
            return;
          }
          if (msg.type === "stream-start") {
            handleStreamStart(name, msg.id);
          }
          if (msg.type === "stream-end") {
            const stream = state.inboundStreams.get(name);
            const requestedStreamId =
              typeof msg.meta?.streamId === "string" ? msg.meta.streamId : undefined;
            if (stream && (!requestedStreamId || requestedStreamId === stream.streamId)) {
              emitDeliveryStatus({ channel: name, messageId: stream.streamId, stage: "received" });
              state.inboundStreams.delete(name);
            }
          }
          if (msg.type === "binary" && !msg.data) {
            state.pendingInboundBinaryMeta.set(name, msg);
            return;
          }
          if (shouldAcknowledgeMessage(name, msg)) {
            queueAck(msg.id, name);
          }
          if (name === CHANNELS.COMMAND) {
            void onCommandMessage(msg).catch((error) => {
              markError("command message handler failed", error);
            });
            return;
          }
          if (name === CHANNELS.PUB_FS) {
            if (
              msg.type === "event" &&
              (msg.data === "pub-fs.write" || msg.data === "pub-fs.delete")
            ) {
              enqueuePubFsWriteLane(msg, "pub-fs message handler failed");
              return;
            }
            void onPubFsMessage(msg).catch((error) => {
              markError("pub-fs message handler failed", error);
            });
            return;
          }
          state.bridgeRunner?.enqueue([{ channel: name, msg }]);
          if (
            name !== CONTROL_CHANNEL &&
            (msg.type === "text" || msg.type === "html" || (msg.type === "binary" && !!msg.data))
          ) {
            emitDeliveryStatus({ channel: name, messageId: msg.id, stage: "received" });
          }
          return;
        }

        const pendingMeta = state.pendingInboundBinaryMeta.get(name);
        const activeStream = state.inboundStreams.get(name);
        if (pendingMeta) state.pendingInboundBinaryMeta.delete(name);
        if (name === CHANNELS.COMMAND) return;
        if (name === CHANNELS.PUB_FS) {
          if (pendingMeta) {
            markError("pub-fs binary chunk must not be preceded by bridge binary metadata");
          }
          enqueuePubFsWriteLane(
            {
              id: generateMessageId(),
              type: "binary",
              data: data.toString("base64"),
              meta: { size: data.length },
            },
            "pub-fs binary handler failed",
          );
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
        if (dedup.isDuplicate(`${name}:${binMsg.id}`)) {
          if (shouldAcknowledgeMessage(name, binMsg)) {
            queueAck(binMsg.id, name);
          }
          return;
        }
        if (shouldAcknowledgeMessage(name, binMsg)) {
          queueAck(binMsg.id, name);
        }
        state.bridgeRunner?.enqueue([{ channel: name, msg: binMsg }]);
        if (!activeStream) {
          emitDeliveryStatus({ channel: name, messageId: binMsg.id, stage: "received" });
        }
      } catch (error) {
        debugLog(`datachannel "${name}" onMessage error`, error);
      }
    });
  }

  /** Get an existing WebRTC-peer DC for this name, or create one on the peer.
   *  Use when a caller needs a single DC handle to send binary frames in order
   *  (pub-fs streams). Tunnel endpoints register through `setupChannel` and do
   *  not route through this helper. */
  function ensurePeerChannel(name: string): DataChannelLike {
    if (!state.peer) throw new Error("PeerConnection not initialized");
    const bucket = state.channels.get(name);
    if (bucket) {
      for (const dc of bucket) {
        if (state.peerDataChannels.has(dc)) return dc;
      }
    }
    const dc = state.peer.createDataChannel(name, ORDERED_DATA_CHANNEL_OPTIONS);
    setupChannel(name, dc, { peerOwned: true });
    return dc;
  }

  async function waitForChannelOpen(dc: DataChannelLike, timeoutMs = 5_000): Promise<void> {
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
    options?: {
      binaryPayload?: Buffer;
      context?: string;
      maxAttempts?: number;
      ackTimeoutMs?: number;
    },
  ): Promise<boolean> {
    const maxAttempts = options?.maxAttempts ?? OUTBOUND_SEND_MAX_ATTEMPTS;
    const ackTimeoutMs = options?.ackTimeoutMs ?? OUTBOUND_ACK_TIMEOUT_MS;
    const context = options?.context ?? `channel "${channel}"`;
    const encoded = encodeMessage(
      options?.binaryPayload
        ? { ...msg, meta: { ...(msg.meta || {}), size: options.binaryPayload.length } }
        : msg,
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (state.stopped || !isLiveConnectionReady(state.runtimeState)) return false;

      let targetDcs = getOpenChannels(channel);
      if (targetDcs.length === 0 && state.peer) {
        try {
          const dc = ensurePeerChannel(channel);
          await waitForChannelOpen(dc);
          targetDcs = getOpenChannels(channel);
        } catch (error) {
          markError(`${context} failed to open (attempt ${attempt}/${maxAttempts})`, error);
          continue;
        }
      }
      if (targetDcs.length === 0) {
        markError(`${context} no open endpoints (attempt ${attempt}/${maxAttempts})`);
        continue;
      }

      const waitForAck = shouldAcknowledgeMessage(channel, msg)
        ? waitForDeliveryAck(msg.id, channel, ackTimeoutMs)
        : null;

      let sendCount = 0;
      for (const dc of targetDcs) {
        try {
          dc.sendMessage(encoded);
          if (msg.type === "binary" && options?.binaryPayload) {
            dc.sendMessageBinary(options.binaryPayload);
          }
          sendCount += 1;
        } catch (error) {
          markError(`${context} send failed on endpoint (attempt ${attempt}/${maxAttempts})`, error);
        }
      }
      if (sendCount === 0) {
        if (waitForAck) settlePendingAck(msg.id, channel, false);
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

  return {
    emitDeliveryStatus,
    ensurePeerChannel,
    failPendingAcks,
    flushQueuedAcks,
    getOpenChannels,
    hasOpenChannel,
    resetMessageDedup,
    sendOutboundMessageWithAck,
    settlePendingAck,
    setupChannel,
    waitForChannelOpen,
    waitForDeliveryAck,
  };
}
