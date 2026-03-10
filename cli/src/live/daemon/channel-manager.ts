import { resolveAckChannel } from "../../../../shared/ack-routing-core";
import {
  type BridgeMessage,
  CHANNELS,
  CONTROL_CHANNEL,
  decodeMessage,
  encodeMessage,
  makeAckMessage,
  makeDeliveryReceiptMessage,
  parseAckMessage,
  shouldAcknowledgeMessage,
} from "../../../../shared/bridge-protocol-core";
import { ORDERED_DATA_CHANNEL_OPTIONS } from "../../../../shared/webrtc-transport-core";
import type { AdapterDataChannel } from "../transport/webrtc-adapter.js";
import type { DaemonState } from "./state.js";

const MAX_SEEN_INBOUND_MESSAGES = 10_000;
const MAX_BUFFERED_MESSAGES = 200;
const OUTBOUND_SEND_MAX_ATTEMPTS = 2;

export function createDaemonChannelManager(params: {
  state: DaemonState;
  debugLog: (message: string, error?: unknown) => void;
  markError: (message: string, error?: unknown) => void;
  onCommandMessage: (msg: BridgeMessage) => Promise<void>;
}) {
  const { state, debugLog, markError, onCommandMessage } = params;

  function appendBufferedMessage(entry: {
    channel: string;
    msg: BridgeMessage;
    timestamp: number;
  }): void {
    if (entry.channel === CHANNELS.COMMAND) return;
    state.buffer.messages.push(entry);
    if (state.buffer.messages.length > MAX_BUFFERED_MESSAGES) {
      state.buffer.messages.splice(0, state.buffer.messages.length - MAX_BUFFERED_MESSAGES);
    }
  }

  function emitDeliveryStatus(params: {
    channel: string;
    messageId: string;
    stage: "received" | "confirmed" | "failed";
    error?: string;
  }): void {
    if (!params.messageId || params.channel === CONTROL_CHANNEL) return;
    const controlDc = state.channels.get(CONTROL_CHANNEL);
    const messageDc = state.channels.get(params.channel);
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

  function getAckKey(messageId: string, channel: string): string {
    return `${channel}:${messageId}`;
  }

  function isDuplicateInboundMessage(channel: string, messageId: string): boolean {
    const key = `${channel}:${messageId}`;
    if (state.seenInboundMessageKeys.has(key)) return true;
    state.seenInboundMessageKeys.add(key);
    if (state.seenInboundMessageKeys.size > MAX_SEEN_INBOUND_MESSAGES) {
      state.seenInboundMessageKeys.clear();
    }
    return false;
  }

  function queueAck(messageId: string, channel: string): void {
    state.pendingOutboundAcks.set(getAckKey(messageId, channel), { messageId, channel });
    flushQueuedAcks();
  }

  function flushQueuedAcks(): void {
    const controlDc = state.channels.get(CONTROL_CHANNEL);
    for (const [ackKey, ack] of state.pendingOutboundAcks) {
      const messageDc = state.channels.get(ack.channel);
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
          state.pendingOutboundAcks.delete(ackKey);
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
          state.pendingOutboundAcks.delete(ackKey);
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

  function setupChannel(name: string, dc: AdapterDataChannel): void {
    state.channels.set(name, dc);
    dc.onOpen(() => {
      if (name === CONTROL_CHANNEL) flushQueuedAcks();
    });

    dc.onClosed(() => {
      state.channels.delete(name);
      state.pendingInboundBinaryMeta.delete(name);
      state.inboundStreams.delete(name);
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
            if (state.pongTimeout) {
              clearTimeout(state.pongTimeout);
              state.pongTimeout = null;
            }
            return;
          }
          const duplicate = isDuplicateInboundMessage(name, msg.id);
          if (duplicate) {
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
            state.inboundStreams.set(name, { streamId: msg.id });
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
            void onCommandMessage(msg);
            return;
          }
          appendBufferedMessage({ channel: name, msg, timestamp: Date.now() });
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
        state.bridgeRunner?.enqueue([{ channel: name, msg: binMsg }]);
        if (!activeStream) {
          emitDeliveryStatus({ channel: name, messageId: binMsg.id, stage: "received" });
        }
      } catch (error) {
        debugLog(`datachannel "${name}" onMessage error`, error);
      }
    });
  }

  function openDataChannel(name: string): AdapterDataChannel {
    if (!state.peer) throw new Error("PeerConnection not initialized");
    const existing = state.channels.get(name);
    if (existing) return existing;
    const dc = state.peer.createDataChannel(name, ORDERED_DATA_CHANNEL_OPTIONS);
    setupChannel(name, dc);
    return dc;
  }

  async function waitForChannelOpen(dc: AdapterDataChannel, timeoutMs = 5_000): Promise<void> {
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
      if (state.stopped || !state.browserConnected) return false;

      let targetDc: AdapterDataChannel;
      try {
        targetDc = state.channels.get(channel) ?? openDataChannel(channel);
        await waitForChannelOpen(targetDc);
      } catch (error) {
        markError(`${context} failed to open (attempt ${attempt}/${maxAttempts})`, error);
        continue;
      }

      const waitForAck = shouldAcknowledgeMessage(channel, msg)
        ? waitForDeliveryAck(msg.id, channel, options?.binaryPayload ? 5_000 : 5_000)
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
      markError(`${context} delivery ack timeout for message ${msg.id} (attempt ${attempt}/${maxAttempts})`);
    }

    return false;
  }

  return {
    appendBufferedMessage,
    emitDeliveryStatus,
    failPendingAcks,
    flushQueuedAcks,
    openDataChannel,
    sendOutboundMessageWithAck,
    settlePendingAck,
    setupChannel,
    waitForChannelOpen,
    waitForDeliveryAck,
  };
}
