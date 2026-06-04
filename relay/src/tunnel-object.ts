import type {
  HttpRequestMessage,
  HttpResponseChunkMessage,
  HttpResponseMessage,
  HttpResponseStartMessage,
  WsCloseMessage,
  WsDataMessage,
  WsOpenMessage,
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
  private pendingRequests = new Map<string, PendingRequest>();
  private proxyWsSockets = new Map<string, WebSocket>();

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
  }

  private getDaemonWs(): WebSocket | null {
    return this.state.getWebSockets("daemon")[0] ?? null;
  }

  private getBrowserWs(): WebSocket | null {
    return this.state.getWebSockets("browser")[0] ?? null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/daemon") return this.handleDaemonUpgrade(request);
    if (url.pathname.startsWith("/ws/")) return this.handleBrowserWsUpgrade(request);
    if (url.pathname.startsWith("/t/")) {
      if (request.headers.get("Upgrade") === "websocket") {
        return this.handleProxyWsUpgrade(request, url);
      }
      return this.handleHttpProxy(request, url);
    }

    return new Response("Not Found", { status: 404 });
  }

  private handleDaemonUpgrade(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    for (const existing of this.state.getWebSockets("daemon")) {
      existing.close(1000, "Replaced by new daemon connection");
    }
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1], ["daemon"]);
    return createWebSocketUpgradeResponse(pair[0], request);
  }

  private handleBrowserWsUpgrade(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    if (!this.getDaemonWs()) {
      return new Response("Tunnel not connected", { status: 502 });
    }
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1], ["browser"]);
    return createWebSocketUpgradeResponse(pair[0], request);
  }

  private handleProxyWsUpgrade(request: Request, url: URL): Response {
    const daemonWs = this.getDaemonWs();
    if (!daemonWs) {
      return new Response("Tunnel not connected", { status: 502 });
    }

    const proxyPath = getTunnelProxyPath(url);
    const id = crypto.randomUUID().slice(0, 8);

    const headers: Record<string, string> = {};
    for (const [k, v] of request.headers.entries()) {
      const lower = k.toLowerCase();
      if (lower === "host" || lower === "connection" || lower === "upgrade") continue;
      headers[k] = v;
    }

    const msg: WsOpenMessage = { type: "ws-open", id, path: proxyPath, headers };
    daemonWs.send(encodeTunnelMessage(msg));

    const pair = new WebSocketPair();
    const browserWs = pair[1];
    browserWs.accept();
    this.proxyWsSockets.set(id, browserWs);
    browserWs.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        this.getDaemonWs()?.send(
          encodeTunnelMessage({ type: "ws-data", id, data: event.data, binary: false }),
        );
      } else if (event.data instanceof ArrayBuffer) {
        this.getDaemonWs()?.send(
          encodeTunnelMessage({
            type: "ws-data",
            id,
            data: arrayBufferToBase64(event.data),
            binary: true,
          }),
        );
      }
    });
    browserWs.addEventListener("close", (event) => {
      this.closeBrowserProxyWs(id, event.code, event.reason);
    });
    browserWs.addEventListener("error", () => {
      this.closeBrowserProxyWs(id, 1011, "Relay WebSocket error");
    });
    return createWebSocketUpgradeResponse(pair[0], request);
  }

  private async handleHttpProxy(request: Request, url: URL): Promise<Response> {
    const daemonWs = this.getDaemonWs();
    if (!daemonWs) {
      return new Response("Tunnel not connected", { status: 502 });
    }

    const proxyPath = getTunnelProxyPath(url);
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
    daemonWs.send(encodeTunnelMessage(msg));

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
    } else if (role === "browser") {
      this.getDaemonWs()?.send(message);
    } else if (role === "proxy-ws") {
      const id = this.getProxyWsId(ws);
      if (id) {
        this.getDaemonWs()?.send(
          encodeTunnelMessage({ type: "ws-data", id, data: message, binary: false }),
        );
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const role = this.getWsRole(ws);
    if (role === "daemon") {
      this.failAllPendingRequests("Tunnel disconnected");
      for (const proxyWs of this.proxyWsSockets.values()) {
        proxyWs.close(1001, "Tunnel disconnected");
      }
      this.proxyWsSockets.clear();
      for (const proxyWs of this.state.getWebSockets("proxy-ws")) {
        proxyWs.close(1001, "Tunnel disconnected");
      }
    } else if (role === "proxy-ws") {
      const id = this.getProxyWsId(ws);
      if (id) {
        this.getDaemonWs()?.send(encodeTunnelMessage({ type: "ws-close", id }));
      }
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
      case "ws-data":
        this.forwardWsData(msg);
        break;
      case "ws-close":
        this.closeProxyWs(msg.id, msg.code, msg.reason);
        break;
      case "channel":
      case "channel-binary":
        this.getBrowserWs()?.send(raw);
        break;
      case "pong":
        break;
    }
  }

  private forwardWsData(msg: WsDataMessage): void {
    const ws = this.findProxyWsById(msg.id);
    if (!ws) return;
    ws.send(msg.binary ? base64ToArrayBuffer(msg.data) : msg.data);
  }

  private closeProxyWs(id: string, code?: number, reason?: string): void {
    const ws = this.findProxyWsById(id);
    this.proxyWsSockets.delete(id);
    ws?.close(code ?? 1000, reason);
  }

  private closeBrowserProxyWs(id: string, code?: number, reason?: string): void {
    if (!this.proxyWsSockets.delete(id)) return;
    const msg: WsCloseMessage = { type: "ws-close", id };
    if (code !== undefined) msg.code = code;
    if (reason !== undefined) msg.reason = reason;
    this.getDaemonWs()?.send(encodeTunnelMessage(msg));
  }

  private findProxyWsById(id: string): WebSocket | null {
    const standardSocket = this.proxyWsSockets.get(id);
    if (standardSocket) return standardSocket;
    const sockets = this.state.getWebSockets(`proxy-ws:${id}`);
    return sockets[0] ?? null;
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

  private getWsRole(ws: WebSocket): "daemon" | "browser" | "proxy-ws" | null {
    const tags = this.state.getTags(ws);
    if (tags.includes("daemon")) return "daemon";
    if (tags.includes("browser")) return "browser";
    if (tags.includes("proxy-ws")) return "proxy-ws";
    return null;
  }

  private getProxyWsId(ws: WebSocket): string | null {
    const tags = this.state.getTags(ws);
    for (const tag of tags) {
      if (tag.startsWith("proxy-ws:")) return tag.slice(9);
    }
    return null;
  }
}

export function getTunnelProxyPath(url: URL): string {
  const pathParts = url.pathname.split("/");
  return `/${pathParts.slice(3).join("/")}${url.search}`;
}

export function getSelectedWebSocketSubprotocol(request: Request): string | null {
  const value = request.headers.get("Sec-WebSocket-Protocol");
  if (!value) return null;
  return (
    value
      .split(",")
      .map((protocol) => protocol.trim())
      .find((protocol) => protocol.length > 0) ?? null
  );
}

function createWebSocketUpgradeResponse(webSocket: WebSocket, request: Request): Response {
  const headers = new Headers();
  const protocol = getSelectedWebSocketSubprotocol(request);
  if (protocol) headers.set("Sec-WebSocket-Protocol", protocol);
  return new Response(null, { status: 101, webSocket, headers });
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
