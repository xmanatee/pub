import type {
  HttpRequestMessage,
  HttpResponseChunkMessage,
  HttpResponseMessage,
  HttpResponseStartMessage,
} from "@shared/tunnel-protocol-core";
import { encodeTunnelMessage, parseDaemonToRelayMessage } from "@shared/tunnel-protocol-core";

const PROXY_TIMEOUT_MS = 30_000;

interface PendingRequest {
  resolve: (response: Response) => void;
  timer: ReturnType<typeof setTimeout>;
  stream?: WritableStreamDefaultWriter;
}

export class TunnelObject implements DurableObject {
  private state: DurableObjectState;
  private daemonWs: WebSocket | null = null;
  private browserWs: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/daemon") return this.handleDaemonUpgrade(request);
    if (url.pathname.startsWith("/ws/")) return this.handleBrowserWsUpgrade(request);
    if (url.pathname.startsWith("/t/")) return this.handleHttpProxy(request, url);

    return new Response("Not Found", { status: 404 });
  }

  private handleDaemonUpgrade(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1], ["daemon"]);
    this.daemonWs = pair[1];
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private handleBrowserWsUpgrade(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    if (!this.daemonWs) {
      return new Response("Tunnel not connected", { status: 502 });
    }
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1], ["browser"]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private async handleHttpProxy(request: Request, url: URL): Promise<Response> {
    if (!this.daemonWs) {
      return new Response("Tunnel not connected", { status: 502 });
    }

    const pathParts = url.pathname.split("/");
    const proxyPath = "/" + pathParts.slice(3).join("/") + url.search;
    const id = crypto.randomUUID().slice(0, 8);

    const headers: Record<string, string> = {};
    for (const [k, v] of request.headers.entries()) {
      const lower = k.toLowerCase();
      if (lower === "host" || lower === "connection") continue;
      headers[k] = v;
    }

    let body: string | undefined;
    if (request.body) {
      const buf = await request.arrayBuffer();
      if (buf.byteLength > 0) {
        body = arrayBufferToBase64(buf);
      }
    }

    const msg: HttpRequestMessage = {
      type: "http-request",
      id,
      method: request.method,
      path: proxyPath,
      headers,
      body,
    };
    this.daemonWs.send(encodeTunnelMessage(msg));

    return new Promise<Response>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve(new Response("Gateway Timeout", { status: 504 }));
      }, PROXY_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, timer });
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const role = this.getWsRole(ws);
    if (!role) return;

    if (role === "daemon") {
      this.handleDaemonMessage(message);
    } else {
      this.daemonWs?.send(message);
    }
  }

  async webSocketOpen(ws: WebSocket): Promise<void> {
    const role = this.getWsRole(ws);
    if (role === "browser") {
      this.browserWs = ws;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const role = this.getWsRole(ws);
    if (role === "daemon") {
      this.daemonWs = null;
      this.failAllPendingRequests("Tunnel disconnected");
    } else if (role === "browser" && this.browserWs === ws) {
      this.browserWs = null;
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private handleDaemonMessage(raw: string): void {
    const msg = parseDaemonToRelayMessage(raw);
    if (!msg) return;

    switch (msg.type) {
      case "http-response":
        this.resolveHttpResponse(msg);
        break;
      case "http-response-start":
        this.startStreamingResponse(msg);
        break;
      case "http-response-chunk":
        this.handleStreamingChunk(msg);
        break;
      case "channel":
      case "ws-data":
      case "ws-close":
        this.browserWs?.send(raw);
        break;
      case "pong":
        break;
    }
  }

  private resolveHttpResponse(msg: HttpResponseMessage): void {
    const pending = this.pendingRequests.get(msg.id);
    if (!pending) return;
    this.pendingRequests.delete(msg.id);
    clearTimeout(pending.timer);

    pending.resolve(
      new Response(msg.body ? base64ToArrayBuffer(msg.body) : null, {
        status: msg.status,
        headers: new Headers(msg.headers),
      }),
    );
  }

  private startStreamingResponse(msg: HttpResponseStartMessage): void {
    const pending = this.pendingRequests.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);

    const { readable, writable } = new TransformStream();
    pending.stream = writable.getWriter();

    pending.resolve(
      new Response(readable, {
        status: msg.status,
        headers: new Headers(msg.headers),
      }),
    );
  }

  private handleStreamingChunk(msg: HttpResponseChunkMessage): void {
    const pending = this.pendingRequests.get(msg.id);
    if (!pending?.stream) return;

    if (msg.data) {
      void pending.stream.write(new Uint8Array(base64ToArrayBuffer(msg.data)));
    }

    if (msg.done) {
      void pending.stream.close();
      this.pendingRequests.delete(msg.id);
    }
  }

  private failAllPendingRequests(reason: string): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve(new Response(reason, { status: 502 }));
    }
    this.pendingRequests.clear();
  }

  private getWsRole(ws: WebSocket): "daemon" | "browser" | null {
    const tags = this.state.getTags(ws);
    if (tags.includes("daemon")) return "daemon";
    if (tags.includes("browser")) return "browser";
    return null;
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
