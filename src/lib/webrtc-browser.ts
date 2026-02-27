/**
 * Browser-side WebRTC bridge client.
 *
 * Manages a PeerConnection, named DataChannels, and media tracks.
 * Signaling happens through Convex (reactive queries + mutations).
 */

import type { BridgeMessage } from "./bridge-protocol";
import {
  CONTROL_CHANNEL,
  DATACHANNEL_OPTIONS,
  decodeMessage,
  encodeMessage,
  makeEventMessage,
  STUN_SERVERS,
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

export class BrowserBridge {
  private pc: RTCPeerConnection | null = null;
  private channels = new Map<string, RTCDataChannel>();
  private state: BridgeState = "connecting";
  private onStateChange: StateChangeHandler | null = null;
  private onMessage: MessageHandler | null = null;
  private onTrack: TrackHandler | null = null;
  private iceCandidates: string[] = [];
  private pendingRemoteCandidates: string[] = [];
  private pendingBinaryMeta = new Map<string, BridgeMessage>();
  private remoteDescriptionSet = false;

  getState(): BridgeState {
    return this.state;
  }

  setOnStateChange(handler: StateChangeHandler): void {
    this.onStateChange = handler;
  }

  setOnMessage(handler: MessageHandler): void {
    this.onMessage = handler;
  }

  setOnTrack(handler: TrackHandler): void {
    this.onTrack = handler;
  }

  getIceCandidates(): string[] {
    return [...this.iceCandidates];
  }

  async createAnswer(agentOffer: string): Promise<string> {
    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

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
      }
    };

    this.pc.ondatachannel = (event) => {
      this.setupChannel(event.channel);
    };

    this.pc.ontrack = (event) => {
      this.onTrack?.(event.track, event.streams);
    };

    const offer = JSON.parse(agentOffer) as RTCSessionDescriptionInit;
    await this.pc.setRemoteDescription(offer);
    this.remoteDescriptionSet = true;

    for (const candidate of this.pendingRemoteCandidates) {
      await this.pc.addIceCandidate(JSON.parse(candidate) as RTCIceCandidateInit);
    }
    this.pendingRemoteCandidates = [];

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    return JSON.stringify(this.pc.localDescription?.toJSON());
  }

  async addRemoteCandidates(candidates: string[]): Promise<void> {
    for (const candidate of candidates) {
      if (!this.remoteDescriptionSet) {
        this.pendingRemoteCandidates.push(candidate);
        continue;
      }
      try {
        await this.pc?.addIceCandidate(JSON.parse(candidate) as RTCIceCandidateInit);
      } catch {
        // Ignore invalid candidates
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

  sendBinary(channel: string, data: ArrayBuffer): boolean {
    const dc = this.channels.get(channel);
    if (!dc || dc.readyState !== "open") return false;
    dc.send(data);
    return true;
  }

  addMediaTrack(track: MediaStreamTrack, stream: MediaStream): void {
    this.pc?.addTrack(track, stream);
  }

  getChannelNames(): string[] {
    return [...this.channels.keys()];
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
          if (msg.type === "binary" && !msg.data) {
            this.pendingBinaryMeta.set(dc.label, msg);
            return;
          }
          this.onMessage?.({
            channel: dc.label,
            message: msg,
            timestamp: Date.now(),
          });
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
        void event.data.arrayBuffer().then((buffer) => {
          this.emitBinaryMessage(dc.label, buffer);
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
  }

  private setState(newState: BridgeState): void {
    if (this.state === newState || this.state === "closed") return;
    this.state = newState;
    this.onStateChange?.(newState);
  }
}
