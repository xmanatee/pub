/**
 * Browser-side WebRTC bridge client.
 *
 * Manages a PeerConnection, named DataChannels, and media tracks.
 * Signaling happens through Convex (reactive queries + mutations).
 */

import {
  IDLE_LIVE_RUNTIME_STATE,
  type LiveRuntimeStateSnapshot,
} from "@shared/live-runtime-state-core";
import { createMessageDedup } from "@shared/message-dedup-core";
import {
  createBrowserOffer,
  parseSessionDescription,
  type SessionDescriptionPayload,
} from "@shared/webrtc-negotiation-core";
import { resolveAckChannel } from "./ack-routing";
import type { BridgeMessage } from "./bridge-protocol";
import {
  CHANNELS,
  CONTROL_CHANNEL,
  DATACHANNEL_OPTIONS,
  type DeliveryReceiptPayload,
  decodeMessage,
  type ErrorPayload,
  encodeMessage,
  generateMessageId,
  makeAckMessage,
  makeEventMessage,
  parseAckMessage,
  parseDeliveryReceiptMessage,
  parseErrorMessage,
  parseStatusMessage,
  shouldAcknowledgeMessage,
} from "./bridge-protocol";

export type BridgeState = "connecting" | "connected" | "disconnected" | "failed" | "closed";

export interface ChannelMessage {
  channel: string;
  message: BridgeMessage;
  timestamp: number;
  binaryData?: ArrayBuffer;
}

type StateChangeHandler = (state: BridgeState) => void;
type RuntimeStateChangeHandler = (state: LiveRuntimeStateSnapshot) => void;
type ControlErrorHandler = (error: ErrorPayload) => void;
type MessageHandler = (msg: ChannelMessage) => void;
type TrackHandler = (track: MediaStreamTrack, streams: readonly MediaStream[]) => void;
type DeliveryReceiptHandler = (receipt: DeliveryReceiptPayload) => void;

const DEDUP_MAX_SIZE = 10_000;

function toSessionDescription(
  description:
    | {
        sdp?: string | null;
        type?: string | null;
      }
    | null
    | undefined,
): SessionDescriptionPayload | null {
  if (!description) return null;
  if (typeof description.sdp !== "string" || description.sdp.length === 0) return null;
  if (typeof description.type !== "string" || description.type.length === 0) return null;
  return { sdp: description.sdp, type: description.type };
}

export class BrowserBridge {
  private pc: RTCPeerConnection | null = null;
  private channels = new Map<string, RTCDataChannel>();
  private state: BridgeState = "connecting";
  private onStateChange: StateChangeHandler | null = null;
  private onRuntimeStateChange: RuntimeStateChangeHandler | null = null;
  private onControlError: ControlErrorHandler | null = null;
  private onMessage: MessageHandler | null = null;
  private onTrack: TrackHandler | null = null;
  private onDeliveryReceipt: DeliveryReceiptHandler | null = null;
  private iceCandidates: string[] = [];
  private pendingRemoteCandidates: string[] = [];
  private pendingBinaryMeta = new Map<string, BridgeMessage>();
  private activeBinaryStreams = new Map<string, { streamId: string; startedAt: number }>();
  private dedup = createMessageDedup(DEDUP_MAX_SIZE);
  private pendingDeliveryAcks = new Map<
    string,
    { resolve: (received: boolean) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private remoteDescriptionSet = false;
  private offerSent = false;
  private pendingAnswer: string | null = null;
  private pendingCandidates: string[] = [];
  private runtimeState: LiveRuntimeStateSnapshot = { ...IDLE_LIVE_RUNTIME_STATE };
  private onProfileMark: ((label: string) => void) | null = null;

  markOfferSent(): void {
    this.offerSent = true;
    if (this.pendingAnswer) {
      const answer = this.pendingAnswer;
      this.pendingAnswer = null;
      void this.applyAnswer(answer);
    }
    if (this.pendingCandidates.length > 0) {
      const candidates = this.pendingCandidates;
      this.pendingCandidates = [];
      void this.addRemoteCandidates(candidates);
    }
  }

  setOnStateChange(handler: StateChangeHandler): void {
    this.onStateChange = handler;
  }

  setOnRuntimeStateChange(handler: RuntimeStateChangeHandler): void {
    this.onRuntimeStateChange = handler;
  }

  setOnControlError(handler: ControlErrorHandler): void {
    this.onControlError = handler;
  }

  setOnMessage(handler: MessageHandler): void {
    this.onMessage = handler;
  }

  setOnTrack(handler: TrackHandler): void {
    this.onTrack = handler;
  }

  setOnDeliveryReceipt(handler: DeliveryReceiptHandler): void {
    this.onDeliveryReceipt = handler;
  }

  setOnProfileMark(handler: (label: string) => void): void {
    this.onProfileMark = handler;
  }

  getIceCandidates(): string[] {
    return [...this.iceCandidates];
  }

  async createOffer(iceServers: RTCIceServer[]): Promise<string> {
    const pc = new RTCPeerConnection({ iceServers });
    this.pc = pc;
    this.setRuntimeState({ ...IDLE_LIVE_RUNTIME_STATE, connectionState: "connecting" });
    this.setupPeerCallbacks();

    this.openChannel(CONTROL_CHANNEL);
    this.openChannel(CHANNELS.CHAT);
    this.openChannel(CHANNELS.RENDER_ERROR);
    this.openChannel(CHANNELS.COMMAND);

    return await createBrowserOffer({
      createOffer: async () => {
        const offer = await pc.createOffer();
        const normalized = toSessionDescription(offer);
        if (!normalized) {
          throw new Error("Browser offer is missing sdp/type");
        }
        return normalized;
      },
      setLocalDescription: async (description) => {
        await pc.setLocalDescription(description as RTCSessionDescriptionInit);
      },
      getLocalDescription: () => toSessionDescription(pc.localDescription),
    });
  }

  async applyAnswer(agentAnswer: string): Promise<void> {
    if (!this.pc) throw new Error("No peer connection");
    if (!this.offerSent) {
      this.pendingAnswer = agentAnswer;
      return;
    }
    const answer = parseSessionDescription(agentAnswer, "Agent answer");
    await this.pc.setRemoteDescription(answer as RTCSessionDescriptionInit);
    this.remoteDescriptionSet = true;

    for (const candidate of this.pendingRemoteCandidates) {
      try {
        await this.pc.addIceCandidate(JSON.parse(candidate) as RTCIceCandidateInit);
      } catch (error) {
        console.warn("Ignoring invalid pending ICE candidate", error);
      }
    }
    this.pendingRemoteCandidates = [];
  }

  private setupPeerCallbacks(): void {
    if (!this.pc) return;

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.iceCandidates.push(JSON.stringify(event.candidate.toJSON()));
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;
      const iceState = this.pc.iceConnectionState;
      if (iceState === "connected" || iceState === "completed") {
        this.onProfileMark?.(`ice-${iceState}`);
        this.setState("connected");
      } else if (iceState === "disconnected") {
        this.setState("disconnected");
        console.warn("Peer ICE connection became unhealthy", { iceState });
      } else if (iceState === "failed") {
        this.setState("failed");
        console.warn("Peer ICE connection became unhealthy", { iceState });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "disconnected") {
        console.warn("Peer connection state issue", { state: this.pc.connectionState });
      }
    };

    this.pc.ondatachannel = (event) => {
      this.setupChannel(event.channel);
    };

    this.pc.ontrack = (event) => {
      this.onTrack?.(event.track, event.streams);
    };
  }

  async addRemoteCandidates(candidates: string[]): Promise<void> {
    if (!this.offerSent) {
      this.pendingCandidates.push(...candidates);
      return;
    }
    for (const candidate of candidates) {
      if (!this.remoteDescriptionSet) {
        this.pendingRemoteCandidates.push(candidate);
        continue;
      }
      try {
        await this.pc?.addIceCandidate(JSON.parse(candidate) as RTCIceCandidateInit);
      } catch (error) {
        console.warn("Ignoring invalid remote ICE candidate", error);
      }
    }
  }

  openChannel(name: string): RTCDataChannel | null {
    if (!this.pc) return null;
    const existing = this.channels.get(name);
    if (existing) return existing;
    const dc = this.pc.createDataChannel(name, DATACHANNEL_OPTIONS);
    this.setupChannel(dc);
    return dc;
  }

  send(channel: string, message: BridgeMessage): boolean {
    const dc = this.channels.get(channel);
    if (!dc || dc.readyState !== "open") return false;
    dc.send(encodeMessage(message));
    return true;
  }

  async sendWithAck(channel: string, message: BridgeMessage, timeoutMs = 5_000): Promise<boolean> {
    if (!shouldAcknowledgeMessage(channel, message)) {
      return this.send(channel, message);
    }

    const ackPromise = this.waitForAck(message.id, channel, timeoutMs);
    if (!this.send(channel, message)) {
      this.settlePendingAck(message.id, channel, false);
      return false;
    }
    return await ackPromise;
  }

  sendBinary(channel: string, data: ArrayBuffer): boolean {
    const dc = this.channels.get(channel);
    if (!dc || dc.readyState !== "open") return false;
    try {
      dc.send(data);
      return true;
    } catch (error) {
      console.warn("Failed to send binary payload over data channel", error);
      return false;
    }
  }

  isChannelOpen(name: string): boolean {
    const dc = this.channels.get(name);
    return dc?.readyState === "open";
  }

  close(): void {
    this.setState("closed");
    for (const dc of this.channels.values()) {
      dc.close();
    }
    this.channels.clear();
    this.dedup.reset();
    this.pc?.close();
    this.pc = null;
  }

  private setupChannel(dc: RTCDataChannel): void {
    this.channels.set(dc.label, dc);

    dc.onopen = () => {
      this.onProfileMark?.(`dc-open:${dc.label}`);
      if (dc.label === CONTROL_CHANNEL) {
        const caps = makeEventMessage("capabilities", {
          caps: ["text", "html", "audio", "video", "binary", "stream", "command"],
        } as Record<string, unknown>);
        dc.send(encodeMessage(caps));
      }
    };

    dc.onmessage = (event) => {
      if (typeof event.data === "string") {
        const msg = decodeMessage(event.data);
        if (msg) {
          const ack = parseAckMessage(msg);
          if (ack) {
            this.settlePendingAck(ack.messageId, ack.channel, true);
            return;
          }

          const receipt = parseDeliveryReceiptMessage(msg);
          if (receipt) {
            this.onDeliveryReceipt?.(receipt);
            return;
          }

          const status = parseStatusMessage(msg);
          if (status) {
            this.setRuntimeState(status);
            return;
          }

          const errorPayload = parseErrorMessage(msg);
          if (errorPayload) {
            console.warn("Received live bridge control error", errorPayload);
            this.onControlError?.(errorPayload);
            this.setRuntimeState({
              ...this.runtimeState,
              agentActivity: "idle",
              agentState: "idle",
              executorState: "idle",
            });
            return;
          }

          if (msg.type === "event" && msg.data === "ping") {
            dc.send(encodeMessage(makeEventMessage("pong")));
            return;
          }

          if (msg.type === "stream-start") {
            const existing = this.activeBinaryStreams.get(dc.label);
            if (existing) {
              console.warn(
                `stream-start on "${dc.label}" while stream ${existing.streamId} active`,
              );
            }
            this.activeBinaryStreams.set(dc.label, { streamId: msg.id, startedAt: Date.now() });
          } else if (
            msg.type === "stream-end" &&
            typeof msg.meta?.streamId === "string" &&
            this.activeBinaryStreams.get(dc.label)?.streamId === msg.meta.streamId
          ) {
            this.activeBinaryStreams.delete(dc.label);
          }

          if (this.dedup.isDuplicate(`${dc.label}:${msg.id}`)) {
            if (msg.type === "binary" && !msg.data) {
              this.pendingBinaryMeta.set(dc.label, msg);
              return;
            }
            if (shouldAcknowledgeMessage(dc.label, msg)) {
              this.sendAck(msg.id, dc.label);
            }
            return;
          }

          if (msg.type === "binary" && !msg.data) {
            this.pendingBinaryMeta.set(dc.label, msg);
            return;
          }
          if (shouldAcknowledgeMessage(dc.label, msg)) {
            this.sendAck(msg.id, dc.label);
          }
          this.onMessage?.({
            channel: dc.label,
            message: msg,
            timestamp: Date.now(),
          });
        } else {
          console.warn("Received non-decodable bridge message", { channel: dc.label });
        }
        return;
      }

      if (event.data instanceof ArrayBuffer) {
        this.emitBinaryMessage(dc.label, event.data);
        return;
      }
      if (ArrayBuffer.isView(event.data)) {
        const view = event.data;
        const buffer = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice().buffer;
        this.emitBinaryMessage(dc.label, buffer);
        return;
      }
      if (event.data instanceof Blob) {
        void event.data
          .arrayBuffer()
          .then((buffer) => {
            this.emitBinaryMessage(dc.label, buffer);
          })
          .catch((error) => {
            console.error("Failed to read binary blob payload", error);
          });
      }
    };

    dc.onclose = () => {
      this.channels.delete(dc.label);
      this.activeBinaryStreams.delete(dc.label);
      this.pendingBinaryMeta.delete(dc.label);
    };
  }

  private emitBinaryMessage(channel: string, payload: ArrayBuffer): void {
    const pendingMeta = this.pendingBinaryMeta.get(channel);
    if (pendingMeta) this.pendingBinaryMeta.delete(channel);
    const activeStream = this.activeBinaryStreams.get(channel);
    const binaryMsg: BridgeMessage = pendingMeta
      ? {
          id: pendingMeta.id,
          type: "binary",
          meta: { ...pendingMeta.meta, size: payload.byteLength },
        }
      : activeStream
        ? {
            id: generateMessageId(),
            type: "binary",
            meta: { streamId: activeStream.streamId, size: payload.byteLength },
          }
        : {
            id: generateMessageId(),
            type: "binary",
            meta: { size: payload.byteLength },
          };
    if (this.dedup.isDuplicate(`${channel}:${binaryMsg.id}`)) {
      if (shouldAcknowledgeMessage(channel, binaryMsg)) {
        this.sendAck(binaryMsg.id, channel);
      }
      return;
    }
    this.onMessage?.({
      channel,
      message: binaryMsg,
      timestamp: Date.now(),
      binaryData: payload,
    });
    if (shouldAcknowledgeMessage(channel, binaryMsg)) {
      this.sendAck(binaryMsg.id, channel);
    }
  }

  private setState(newState: BridgeState): void {
    if (this.state === newState || this.state === "closed") return;
    if (newState === "connecting") {
      this.setRuntimeState({
        ...this.runtimeState,
        connectionState: "connecting",
      });
    } else if (newState === "connected") {
      this.setRuntimeState({
        ...this.runtimeState,
        connectionState: "connected",
      });
    } else if (newState === "disconnected") {
      this.failPendingAcks();
      this.setRuntimeState({
        ...this.runtimeState,
        connectionState: "disconnected",
      });
    } else if (newState === "failed") {
      this.failPendingAcks();
      this.setRuntimeState({
        agentActivity: "idle",
        agentState: "idle",
        connectionState: "failed",
        executorState: "idle",
      });
    } else if (newState === "closed") {
      this.failPendingAcks();
      this.setRuntimeState({ ...IDLE_LIVE_RUNTIME_STATE });
    }
    this.state = newState;
    this.onStateChange?.(newState);
  }

  private setRuntimeState(nextState: LiveRuntimeStateSnapshot): void {
    if (
      this.runtimeState.agentActivity === nextState.agentActivity &&
      this.runtimeState.agentState === nextState.agentState &&
      this.runtimeState.connectionState === nextState.connectionState &&
      this.runtimeState.executorState === nextState.executorState
    ) {
      return;
    }
    const previous = this.runtimeState;
    this.runtimeState = nextState;
    if (previous.connectionState !== "connected" && nextState.connectionState === "connected") {
      this.onProfileMark?.("connection-ready");
    }
    if (previous.agentState !== "ready" && nextState.agentState === "ready") {
      this.onProfileMark?.("agent-ready");
    }
    if (previous.executorState !== "ready" && nextState.executorState === "ready") {
      this.onProfileMark?.("executor-ready");
    }
    this.onRuntimeStateChange?.(nextState);
  }

  private sendAck(messageId: string, channel: string): void {
    const ack = makeAckMessage(messageId, channel);
    const target = resolveAckChannel({
      controlChannelOpen: this.isChannelOpen(CONTROL_CHANNEL),
      messageChannel: channel,
      messageChannelOpen: this.isChannelOpen(channel),
    });
    if (!target) return;

    if (this.send(target, ack)) return;
    const fallback = target === channel ? CONTROL_CHANNEL : channel;
    if (fallback === target) return;
    this.send(fallback, ack);
  }

  private getAckKey(messageId: string, channel: string): string {
    return `${channel}:${messageId}`;
  }

  private waitForAck(messageId: string, channel: string, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const key = this.getAckKey(messageId, channel);
      const existing = this.pendingDeliveryAcks.get(key);
      if (existing) {
        clearTimeout(existing.timer);
        this.pendingDeliveryAcks.delete(key);
      }
      const timer = setTimeout(() => {
        this.pendingDeliveryAcks.delete(key);
        resolve(false);
      }, timeoutMs);

      this.pendingDeliveryAcks.set(key, { resolve, timer });
    });
  }

  private settlePendingAck(messageId: string, channel: string, received: boolean): void {
    const key = this.getAckKey(messageId, channel);
    const pending = this.pendingDeliveryAcks.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingDeliveryAcks.delete(key);
    pending.resolve(received);
  }

  private failPendingAcks(): void {
    for (const [ackKey, pending] of this.pendingDeliveryAcks) {
      clearTimeout(pending.timer);
      pending.resolve(false);
      this.pendingDeliveryAcks.delete(ackKey);
    }
  }
}
