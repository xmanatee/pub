import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import { encodeMessage } from "../../../../shared/bridge-protocol-core";
import type { DaemonToRelayMessage } from "../../../../shared/tunnel-protocol-core";
import type { DataChannelLike } from "../transport/webrtc-adapter.js";

type MessageCallback = (data: string | Buffer) => void;

export class TunnelDataChannel implements DataChannelLike {
  private messageCallbacks: MessageCallback[] = [];
  private openCallbacks: (() => void)[] = [];
  private closedCallbacks: (() => void)[] = [];
  private opened = false;
  private closed = false;

  constructor(
    private readonly channelName: string,
    private readonly send: (msg: DaemonToRelayMessage) => void,
  ) {}

  onMessage(cb: MessageCallback): void {
    this.messageCallbacks.push(cb);
  }

  onOpen(cb: () => void): void {
    if (this.opened) {
      cb();
      return;
    }
    this.openCallbacks.push(cb);
  }

  onClosed(cb: () => void): void {
    if (this.closed) {
      cb();
      return;
    }
    this.closedCallbacks.push(cb);
  }

  onError(_cb: (error: string) => void): void {}

  get bufferedAmount(): number {
    return 0;
  }

  waitForDrain(_threshold: number, _timeoutMs: number): Promise<boolean> {
    return Promise.resolve(true);
  }

  sendMessage(msg: string): void {
    this.send({
      type: "channel",
      channel: this.channelName,
      message: JSON.parse(msg) as BridgeMessage,
    });
  }

  sendMessageBinary(data: Buffer): void {
    this.send({
      type: "channel-binary",
      channel: this.channelName,
      data: data.toString("base64"),
    });
  }

  isOpen(): boolean {
    return this.opened && !this.closed;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const cb of this.closedCallbacks) cb();
  }

  /** Called by the tunnel message router when a channel message arrives. */
  dispatchMessage(message: BridgeMessage): void {
    const encoded = encodeMessage(message);
    for (const cb of this.messageCallbacks) cb(encoded);
  }

  /** Called by the tunnel message router when a binary channel message arrives. */
  dispatchBinary(data: Buffer): void {
    for (const cb of this.messageCallbacks) cb(data);
  }

  /** Called after the tunnel WS connects to mark all channels as open. */
  markOpen(): void {
    if (this.opened) return;
    this.opened = true;
    for (const cb of this.openCallbacks) cb();
  }
}
