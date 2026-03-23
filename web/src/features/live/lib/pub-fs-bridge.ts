/**
 * Main-page bridge for the pub-fs Service Worker virtual filesystem.
 *
 * Receives file requests from the sandbox iframe (forwarded from the SW via
 * postMessage), sends them over WebRTC to the CLI agent, and streams
 * responses back through the MessagePort directly to the SW.
 *
 * Supports GET (read/stream), PUT (write), and DELETE operations.
 */

import { CHANNELS, STREAM_CHUNK_SIZE } from "@shared/bridge-protocol-core";
import {
  makePubFsCancelMessage,
  makePubFsDeleteMessage,
  makePubFsReadMessage,
  makePubFsWriteMessage,
  parsePubFsDoneMessage,
  parsePubFsErrorMessage,
  parsePubFsMetadataMessage,
} from "@shared/pub-fs-protocol-core";
import type { BrowserBridge, ChannelMessage } from "~/features/live/lib/webrtc-browser";

interface PendingRequest {
  requestId: string;
  port: MessagePort;
  sent: boolean;
}

export class PubFsBridge {
  private pending = new Map<string, PendingRequest>();
  private activeRequestId: string | null = null;
  private bridgeRef: React.RefObject<BrowserBridge | null>;
  private getReadyBridge: () => Promise<BrowserBridge | null>;
  private iframeWindow: Window | null = null;
  private boundWindowListener: ((event: MessageEvent) => void) | null = null;

  constructor(
    bridgeRef: React.RefObject<BrowserBridge | null>,
    getReadyBridge: () => Promise<BrowserBridge | null>,
  ) {
    this.bridgeRef = bridgeRef;
    this.getReadyBridge = getReadyBridge;
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

    const { method, requestId, path } = data;
    if (typeof requestId !== "string" || typeof path !== "string") return;

    const port = event.ports[0];
    if (!port) return;

    if (method === "PUT") {
      void this.handlePut(requestId, path, data, port);
      return;
    }

    if (method === "DELETE") {
      void this.handleDelete(requestId, path, port);
      return;
    }

    void this.handleGet(requestId, path, data, port);
  }

  private async resolveReadyBridge(port: MessagePort): Promise<BrowserBridge | null> {
    const bridge = await this.getReadyBridge();
    if (bridge) return bridge;
    port.postMessage({ type: "error", code: "NO_CONNECTION", message: "No live connection." });
    return null;
  }

  private async handleGet(
    requestId: string,
    path: string,
    data: Record<string, unknown>,
    port: MessagePort,
  ): Promise<void> {
    this.pending.set(requestId, { requestId, port, sent: false });
    const bridge = await this.resolveReadyBridge(port);
    if (!bridge || !this.pending.has(requestId)) return;
    const sent = bridge.send(
      CHANNELS.PUB_FS,
      makePubFsReadMessage({
        requestId,
        path,
        rangeStart: typeof data.rangeStart === "number" ? data.rangeStart : undefined,
        rangeEnd: typeof data.rangeEnd === "number" ? data.rangeEnd : undefined,
      }),
    );
    if (!sent) {
      this.pending.delete(requestId);
      port.postMessage({
        type: "error",
        code: "CHANNEL_NOT_READY",
        message: "Pub FS channel is not ready.",
      });
      return;
    }
    const pending = this.pending.get(requestId);
    if (pending) pending.sent = true;
  }

  private async handlePut(
    requestId: string,
    path: string,
    data: Record<string, unknown>,
    port: MessagePort,
  ): Promise<void> {
    const body = data.body instanceof ArrayBuffer ? data.body : null;
    if (!body) {
      port.postMessage({ type: "error", code: "INVALID_BODY", message: "Missing request body." });
      return;
    }
    this.pending.set(requestId, { requestId, port, sent: false });
    const bridge = await this.resolveReadyBridge(port);
    if (!bridge || !this.pending.has(requestId)) return;
    const started = bridge.send(
      CHANNELS.PUB_FS,
      makePubFsWriteMessage({ requestId, path, size: body.byteLength }),
    );
    if (!started) {
      this.pending.delete(requestId);
      port.postMessage({
        type: "error",
        code: "CHANNEL_NOT_READY",
        message: "Pub FS channel is not ready.",
      });
      return;
    }
    const pending = this.pending.get(requestId);
    if (pending) pending.sent = true;
    // Send body in chunks
    const bytes = new Uint8Array(body);
    for (let offset = 0; offset < bytes.length; offset += STREAM_CHUNK_SIZE) {
      const sent = bridge.sendBinary(
        CHANNELS.PUB_FS,
        bytes.slice(offset, offset + STREAM_CHUNK_SIZE).buffer,
      );
      if (!sent) {
        this.pending.delete(requestId);
        this.activeRequestId = null;
        port.postMessage({
          type: "error",
          code: "CHANNEL_NOT_READY",
          message: "Pub FS channel is not ready.",
        });
        return;
      }
    }
  }

  private async handleDelete(requestId: string, path: string, port: MessagePort): Promise<void> {
    this.pending.set(requestId, { requestId, port, sent: false });
    const bridge = await this.resolveReadyBridge(port);
    if (!bridge || !this.pending.has(requestId)) return;
    const sent = bridge.send(CHANNELS.PUB_FS, makePubFsDeleteMessage({ requestId, path }));
    if (!sent) {
      this.pending.delete(requestId);
      port.postMessage({
        type: "error",
        code: "CHANNEL_NOT_READY",
        message: "Pub FS channel is not ready.",
      });
      return;
    }
    const pending = this.pending.get(requestId);
    if (pending) pending.sent = true;
  }

  handleChannelMessage(cm: ChannelMessage): void {
    const { message, binaryData } = cm;

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
      if (this.activeRequestId === doneRequestId) this.activeRequestId = null;
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
      if (bridge && pending.sent) {
        bridge.send(CHANNELS.PUB_FS, makePubFsCancelMessage({ requestId }));
      }
    }
    this.pending.clear();
    this.activeRequestId = null;
    this.iframeWindow = null;
  }
}
