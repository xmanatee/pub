/**
 * Adapter wrapping werift's W3C-style WebRTC API into a callback-style API.
 * Consumers import AdapterPeerConnection / AdapterDataChannel instead of
 * using werift types directly.
 */

import {
  RTCDataChannel,
  RTCPeerConnection,
  type RTCIceServer,
} from "werift";
import type { IceServer } from "../../../../shared/webrtc-transport-core";

interface DataChannelOptions {
  ordered?: boolean;
  maxRetransmits?: number;
  protocol?: string;
}

interface PeerConnectionOptions {
  iceServers?: readonly IceServer[];
  iceAdditionalHostAddresses?: readonly string[];
  iceUseIpv4?: boolean;
  iceUseIpv6?: boolean;
}

export class AdapterDataChannel {
  constructor(private readonly dc: RTCDataChannel) {}

  onMessage(cb: (data: string | Buffer) => void): void {
    this.dc.onMessage.subscribe((raw) => cb(raw));
  }

  onOpen(cb: () => void): void {
    if (this.dc.readyState === "open") {
      cb();
      return;
    }
    this.dc.stateChanged.subscribe((state) => {
      if (state === "open") cb();
    });
  }

  onClosed(cb: () => void): void {
    this.dc.stateChanged.subscribe((state) => {
      if (state === "closed") cb();
    });
  }

  onError(cb: (error: string) => void): void {
    this.dc.error.subscribe((err) => cb(err instanceof Error ? err.message : String(err)));
  }

  sendMessage(msg: string): void {
    this.dc.send(msg);
  }

  sendMessageBinary(data: Buffer): void {
    this.dc.send(data);
  }

  get bufferedAmount(): number {
    return this.dc.bufferedAmount;
  }

  waitForDrain(threshold: number, timeoutMs: number): Promise<boolean> {
    if (this.dc.bufferedAmount <= threshold) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        sub.unSubscribe();
        resolve(false);
      }, timeoutMs);
      this.dc.bufferedAmountLowThreshold = threshold;
      const sub = this.dc.bufferedAmountLow.subscribe(() => {
        clearTimeout(timer);
        sub.unSubscribe();
        resolve(true);
      });
    });
  }

  close(): void {
    this.dc.close();
  }

  getLabel(): string {
    return this.dc.label;
  }

  isOpen(): boolean {
    return this.dc.readyState === "open";
  }
}

export class AdapterPeerConnection {
  private readonly pc: RTCPeerConnection;
  private localDescriptionCb: ((sdp: string, type: string) => void) | null = null;

  constructor(config?: PeerConnectionOptions) {
    // werift requires urls as a single string per entry, not an array.
    // The backend normalizes protocols (filtering unsupported ones like turns:),
    // so this layer only needs to flatten multi-URL entries into individual ones.
    const iceServers: RTCIceServer[] = (config?.iceServers ?? []).flatMap((entry) => {
      const urlList = typeof entry.urls === "string" ? [entry.urls] : entry.urls;
      return urlList.map((url) => ({
        urls: url,
        username: entry.username,
        credential: entry.credential,
      }));
    });
    this.pc = new RTCPeerConnection({
      iceServers,
      iceAdditionalHostAddresses: config?.iceAdditionalHostAddresses
        ? [...config.iceAdditionalHostAddresses]
        : undefined,
      iceUseIpv4: config?.iceUseIpv4,
      iceUseIpv6: config?.iceUseIpv6,
    });
  }

  onLocalCandidate(cb: (candidate: string, mid: string) => void): void {
    this.pc.onIceCandidate.subscribe((candidate) => {
      if (candidate?.candidate) {
        cb(candidate.candidate, candidate.sdpMid ?? "0");
      }
    });
  }

  onStateChange(cb: (state: string) => void): void {
    this.pc.connectionStateChange.subscribe((state) => cb(state));
  }

  onIceStateChange(cb: (state: string) => void): void {
    this.pc.iceConnectionStateChange.subscribe((state) => cb(state));
  }

  onGatheringStateChange(cb: (state: string) => void): void {
    this.pc.iceGatheringStateChange.subscribe((state) => cb(state));
  }

  onDataChannel(cb: (dc: AdapterDataChannel) => void): void {
    this.pc.onDataChannel.subscribe((dc) => cb(new AdapterDataChannel(dc)));
  }

  onLocalDescription(cb: (sdp: string, type: string) => void): void {
    this.localDescriptionCb = cb;
  }

  async setRemoteDescription(sdp: string, type: string): Promise<void> {
    await this.pc.setRemoteDescription({ sdp, type: type as "offer" | "answer" });

    if (type === "offer") {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      if (this.localDescriptionCb && this.pc.localDescription) {
        this.localDescriptionCb(this.pc.localDescription.sdp, this.pc.localDescription.type);
      }
    }
  }

  localDescription(): { sdp: string; type: string } | null {
    const desc = this.pc.localDescription;
    if (!desc) return null;
    return { sdp: desc.sdp, type: desc.type };
  }

  async addRemoteCandidate(candidate: string, mid: string): Promise<void> {
    await this.pc.addIceCandidate({ candidate, sdpMid: mid });
  }

  createDataChannel(label: string, opts?: DataChannelOptions): AdapterDataChannel {
    const dc = this.pc.createDataChannel(label, {
      ordered: opts?.ordered,
      maxRetransmits: opts?.maxRetransmits,
      protocol: opts?.protocol ?? "",
    });
    return new AdapterDataChannel(dc);
  }

  async setLocalDescription(): Promise<void> {
    await this.pc.setLocalDescription();
    if (this.localDescriptionCb && this.pc.localDescription) {
      this.localDescriptionCb(this.pc.localDescription.sdp, this.pc.localDescription.type);
    }
  }

  async close(): Promise<void> {
    await this.pc.close();
  }
}

export function createPeerConnection(config?: PeerConnectionOptions): AdapterPeerConnection {
  return new AdapterPeerConnection(config);
}
