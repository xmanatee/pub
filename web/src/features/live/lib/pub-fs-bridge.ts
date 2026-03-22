/**
 * Main-page bridge for the pub-fs Service Worker virtual filesystem.
 *
 * Receives file requests from the sandbox iframe (forwarded from the SW via
 * postMessage), sends them over WebRTC to the CLI agent, and streams bytes
 * back through the MessagePort directly to the SW.
 */

import { CHANNELS } from "@shared/bridge-protocol-core";
import {
  makePubFsCancelMessage,
  makePubFsReadMessage,
  parsePubFsDoneMessage,
  parsePubFsErrorMessage,
  parsePubFsMetadataMessage,
} from "@shared/pub-fs-protocol-core";
import type { BrowserBridge, ChannelMessage } from "~/features/live/lib/webrtc-browser";

interface PendingRequest {
  requestId: string;
  port: MessagePort;
}

export class PubFsBridge {
  private pending = new Map<string, PendingRequest>();
  private activeRequestId: string | null = null;
  private bridgeRef: React.RefObject<BrowserBridge | null>;
  private iframeWindow: Window | null = null;
  private boundWindowListener: ((event: MessageEvent) => void) | null = null;

  constructor(bridgeRef: React.RefObject<BrowserBridge | null>) {
    this.bridgeRef = bridgeRef;
    this.boundWindowListener = this.handleWindowMessage.bind(this);
    window.addEventListener("message", this.boundWindowListener);
  }

  setIframeWindow(win: Window | null): void {
    this.iframeWindow = win;
  }

  private handleWindowMessage(event: MessageEvent): void {
    const data = event.data;
    if (!data || data.type !== "pub-fs-request") return;
    if (this.iframeWindow && event.source !== this.iframeWindow) return;

    const { requestId, path, rangeStart, rangeEnd } = data;
    if (typeof requestId !== "string" || typeof path !== "string") return;

    const port = event.ports[0];
    if (!port) return;

    const bridge = this.bridgeRef.current;
    if (!bridge) {
      port.postMessage({ type: "error", code: "NO_CONNECTION", message: "No live connection." });
      return;
    }

    this.pending.set(requestId, { requestId, port });

    bridge.send(
      CHANNELS.PUB_FS,
      makePubFsReadMessage({
        requestId,
        path,
        rangeStart: typeof rangeStart === "number" ? rangeStart : undefined,
        rangeEnd: typeof rangeEnd === "number" ? rangeEnd : undefined,
      }),
    );
  }

  handleChannelMessage(cm: ChannelMessage): void {
    const { message, binaryData } = cm;

    // Binary data: CLI serializes reads, so chunks belong to activeRequestId
    if (message.type === "binary" && binaryData) {
      if (!this.activeRequestId) return;
      const pending = this.pending.get(this.activeRequestId);
      if (!pending) return;
      pending.port.postMessage({ type: "chunk", data: binaryData }, [binaryData]);
      return;
    }

    const metadata = parsePubFsMetadataMessage(message);
    if (metadata) {
      this.activeRequestId = metadata.requestId;
      const pending = this.pending.get(metadata.requestId);
      if (!pending) return;
      pending.port.postMessage({
        type: "metadata",
        totalSize: metadata.totalSize,
        mime: metadata.mime,
        rangeStart: metadata.rangeStart,
        rangeEnd: metadata.rangeEnd,
      });
      return;
    }

    const doneRequestId = parsePubFsDoneMessage(message);
    if (doneRequestId) {
      this.activeRequestId = null;
      const pending = this.pending.get(doneRequestId);
      if (!pending) return;
      pending.port.postMessage({ type: "done" });
      this.pending.delete(doneRequestId);
      return;
    }

    const error = parsePubFsErrorMessage(message);
    if (error) {
      if (this.activeRequestId === error.requestId) this.activeRequestId = null;
      const pending = this.pending.get(error.requestId);
      if (!pending) return;
      pending.port.postMessage({ type: "error", code: error.code, message: error.message });
      this.pending.delete(error.requestId);
      return;
    }
  }

  destroy(): void {
    if (this.boundWindowListener) {
      window.removeEventListener("message", this.boundWindowListener);
      this.boundWindowListener = null;
    }
    const bridge = this.bridgeRef.current;
    for (const [requestId, pending] of this.pending) {
      pending.port.postMessage({
        type: "error",
        code: "BRIDGE_DESTROYED",
        message: "Connection closed.",
      });
      if (bridge) {
        bridge.send(CHANNELS.PUB_FS, makePubFsCancelMessage({ requestId }));
      }
    }
    this.pending.clear();
    this.activeRequestId = null;
    this.iframeWindow = null;
  }

  reset(): void {
    for (const [, pending] of this.pending) {
      pending.port.postMessage({
        type: "error",
        code: "SESSION_RESET",
        message: "Live session reset.",
      });
    }
    this.pending.clear();
    this.activeRequestId = null;
  }
}
