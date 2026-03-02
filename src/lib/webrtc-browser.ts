/**
 * Browser-side WebRTC bridge client.
 *
 * Manages a PeerConnection, named DataChannels, and media tracks.
 * Signaling happens through Convex (reactive queries + mutations).
 */

import { resolveAckChannel } from "./ack-routing";
import type { BridgeMessage } from "./bridge-protocol";
import {
  CHANNELS,
  CONTROL_CHANNEL,
  DATACHANNEL_OPTIONS,
  type DeliveryAckPayload,
  decodeMessage,
  encodeMessage,
  makeAckMessage,
  makeEventMessage,
  parseAckMessage,
  STUN_SERVERS,
  shouldAcknowledgeMessage,
} from "./bridge-protocol";

export type BridgeState = "connecting" | "connected" | "disconnected" | "closed";

export interface ChannelMessage {
  channel: string;
  message: BridgeMessage;
  timestamp: number;
  binaryData?: ArrayBuffer;
}

type StateChangeHandler = (state: BridgeState) => void;
type MessageHandler = (msg: ChannelMessage) => void;
type TrackHandler = (track: MediaStreamTrack, streams: readonly MediaStream[]) => void;
type DeliveryAckHandler = (ack: DeliveryAckPayload) => void;

export class BrowserBridge {
  private pc: RTCPeerConnection | null = null;
  private channels = new Map<string, RTCDataChannel>();
  private state: BridgeState = "connecting";
  private onStateChange: StateChangeHandler | null = null;
  private onMessage: MessageHandler | null = null;
  private onTrack: TrackHandler | null = null;
  private onDeliveryAck: DeliveryAckHandler | null = null;
  private iceCandidates: string[] = [];
  private pendingRemoteCandidates: string[] = [];
  private pendingBinaryMeta = new Map<string, BridgeMessage>();
  private pendingDeliveryAcks = new Map<
    string,
    { resolve: (received: boolean) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private remoteDescriptionSet = false;

  setOnStateChange(handler: StateChangeHandler): void {
    this.onStateChange = handler;
  }

  setOnMessage(handler: MessageHandler): void {
    this.onMessage = handler;
  }

  setOnTrack(handler: TrackHandler): void {
    this.onTrack = handler;
  }

  setOnDeliveryAck(handler: DeliveryAckHandler): void {
    this.onDeliveryAck = handler;
  }

  getIceCandidates(): string[] {
    return [...this.iceCandidates];
  }

  async createOffer(): Promise<string> {
    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this.setupPeerCallbacks();

    this.openChannel(CONTROL_CHANNEL);
    this.openChannel(CHANNELS.CHAT);
    this.openChannel(CHANNELS.CANVAS);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return JSON.stringify(this.pc.localDescription?.toJSON());
  }

  async applyAnswer(agentAnswer: string): Promise<void> {
    if (!this.pc) throw new Error("No peer connection");
    const answer = JSON.parse(agentAnswer) as RTCSessionDescriptionInit;
    await this.pc.setRemoteDescription(answer);
    this.remoteDescriptionSet = true;

    for (const candidate of this.pendingRemoteCandidates) {
      await this.pc.addIceCandidate(JSON.parse(candidate) as RTCIceCandidateInit);
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
        this.setState("connected");
      } else if (iceState === "disconnected" || iceState === "failed") {
        this.setState("disconnected");
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
    for (const candidate of candidates) {
      if (!this.remoteDescriptionSet) {
        this.pendingRemoteCandidates.push(candidate);
        continue;
      }
      try {
        await this.pc?.addIceCandidate(JSON.parse(candidate) as RTCIceCandidateInit);
      } catch (error) {
        // Ignore invalid candidates
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

    const ackPromise = this.waitForAck(message.id, timeoutMs);
    if (!this.send(channel, message)) {
      this.settlePendingAck(message.id, false);
      return false;
    }
    return await ackPromise;
  }

  sendBinary(channel: string, data: ArrayBuffer): boolean {
    const dc = this.channels.get(channel);
    if (!dc || dc.readyState !== "open") return false;
    dc.send(data);
    return true;
  }

  isChannelOpen(name: string): boolean {
    const dc = this.channels.get(name);
    return dc?.readyState === "open";
  }

  close(): void {
    this.failPendingAcks();
    this.setState("closed");
    for (const dc of this.channels.values()) {
      dc.close();
    }
    this.channels.clear();
    this.pc?.close();
    this.pc = null;
  }

  private setupChannel(dc: RTCDataChannel): void {
    this.channels.set(dc.label, dc);

    dc.onopen = () => {
      if (dc.label === CONTROL_CHANNEL) {
        const caps = makeEventMessage("capabilities", {
          caps: ["text", "html", "audio", "video", "binary", "stream"],
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
            this.settlePendingAck(ack.messageId, true);
            this.onDeliveryAck?.(ack);
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
      this.pendingBinaryMeta.delete(dc.label);
    };
  }

  private emitBinaryMessage(channel: string, payload: ArrayBuffer): void {
    const pendingMeta = this.pendingBinaryMeta.get(channel);
    if (pendingMeta) this.pendingBinaryMeta.delete(channel);
    const binaryMsg: BridgeMessage = pendingMeta
      ? {
          id: pendingMeta.id,
          type: "binary",
          meta: { ...pendingMeta.meta, size: payload.byteLength },
        }
      : {
          id: `bin-${Date.now()}`,
          type: "binary",
          meta: { size: payload.byteLength },
        };
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
    if (newState === "disconnected" || newState === "closed") {
      this.failPendingAcks();
    }
    this.state = newState;
    this.onStateChange?.(newState);
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

  private waitForAck(messageId: string, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingDeliveryAcks.delete(messageId);
        resolve(false);
      }, timeoutMs);

      this.pendingDeliveryAcks.set(messageId, { resolve, timer });
    });
  }

  private settlePendingAck(messageId: string, received: boolean): void {
    const pending = this.pendingDeliveryAcks.get(messageId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingDeliveryAcks.delete(messageId);
    pending.resolve(received);
  }

  private failPendingAcks(): void {
    for (const [messageId, pending] of this.pendingDeliveryAcks) {
      clearTimeout(pending.timer);
      pending.resolve(false);
      this.pendingDeliveryAcks.delete(messageId);
    }
  }
}
