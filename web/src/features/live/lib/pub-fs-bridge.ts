/**
 * Main-page bridge for the pub-fs Service Worker virtual filesystem.
 *
 * Receives file requests from the sandbox iframe (forwarded from the SW via
 * postMessage), sends them over WebRTC to the CLI agent, and streams
 * responses back through the MessagePort directly to the SW.
 *
 * Binary chunks carry a tagged header (requestId + data) so multiple reads
 * can transfer concurrently without interleaving corruption.
 *
 * The MessagePort is bidirectional: the bridge sends data/metadata/done/error
 * to the SW, and the SW sends cancel messages back through the same port.
 *
 * Supports GET (read/stream), PUT (write), and DELETE operations.
 */

import { CHANNELS, STREAM_CHUNK_SIZE } from "@shared/bridge-protocol-core";
import {
  decodeTaggedChunk,
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

  // --- Pending request lifecycle ---

  private setupPortCancel(requestId: string, port: MessagePort): void {
    port.onmessage = (ev: MessageEvent) => {
      if (ev.data?.type === "cancel") {
        const pending = this.removePending(requestId);
        if (!pending) return;
        if (pending.sent) {
          this.bridgeRef.current?.send(CHANNELS.PUB_FS, makePubFsCancelMessage({ requestId }));
        }
      }
    };
  }

  private removePending(requestId: string): PendingRequest | undefined {
    const pending = this.pending.get(requestId);
    if (!pending) return undefined;
    pending.port.onmessage = null;
    this.pending.delete(requestId);
    return pending;
  }

  // --- Request dispatch ---

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
    this.setupPortCancel(requestId, port);
    const bridge = await this.resolveReadyBridge(port);
    if (!bridge) {
      this.removePending(requestId);
      return;
    }
    if (!this.pending.has(requestId)) return;
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
      this.removePending(requestId);
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
    this.setupPortCancel(requestId, port);
    const bridge = await this.resolveReadyBridge(port);
    if (!bridge) {
      this.removePending(requestId);
      return;
    }
    if (!this.pending.has(requestId)) return;
    const started = bridge.send(
      CHANNELS.PUB_FS,
      makePubFsWriteMessage({ requestId, path, size: body.byteLength }),
    );
    if (!started) {
      this.removePending(requestId);
      port.postMessage({
        type: "error",
        code: "CHANNEL_NOT_READY",
        message: "Pub FS channel is not ready.",
      });
      return;
    }
    const pending = this.pending.get(requestId);
    if (pending) pending.sent = true;
    const bytes = new Uint8Array(body);
    for (let offset = 0; offset < bytes.length; offset += STREAM_CHUNK_SIZE) {
      const sent = bridge.sendBinary(
        CHANNELS.PUB_FS,
        bytes.slice(offset, offset + STREAM_CHUNK_SIZE).buffer,
      );
      if (!sent) {
        this.removePending(requestId);
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
    this.setupPortCancel(requestId, port);
    const bridge = await this.resolveReadyBridge(port);
    if (!bridge) {
      this.removePending(requestId);
      return;
    }
    if (!this.pending.has(requestId)) return;
    const sent = bridge.send(CHANNELS.PUB_FS, makePubFsDeleteMessage({ requestId, path }));
    if (!sent) {
      this.removePending(requestId);
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

  // --- Response routing ---

  handleChannelMessage(cm: ChannelMessage): void {
    const { message, binaryData } = cm;

    if (message.type === "binary" && binaryData) {
      const tagged = decodeTaggedChunk(binaryData);
      if (!tagged) return;
      const pending = this.pending.get(tagged.requestId);
      if (!pending) return;
      pending.port.postMessage({ type: "chunk", data: tagged.data }, [tagged.data]);
      return;
    }

    const metadata = parsePubFsMetadataMessage(message);
    if (metadata) {
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
      const pending = this.removePending(doneRequestId);
      if (!pending) return;
      pending.port.postMessage({ type: "done" });
      return;
    }

    const error = parsePubFsErrorMessage(message);
    if (error) {
      const pending = this.removePending(error.requestId);
      if (!pending) return;
      pending.port.postMessage({ type: "error", code: error.code, message: error.message });
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
      pending.port.onmessage = null;
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
    this.iframeWindow = null;
  }
}
