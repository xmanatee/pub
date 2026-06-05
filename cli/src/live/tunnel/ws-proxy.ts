import type {
  DaemonToRelayMessage,
  WsCloseMessage,
  WsDataMessage,
  WsOpenMessage,
} from "../../../../shared/tunnel-protocol-core";
import {
  normalizeWebSocketCloseFrame,
  TUNNEL_ABNORMAL_WS_CLOSE_CODE,
} from "../../../../shared/tunnel-protocol-core";
import { uint8ToBase64 } from "./encoding.js";

export interface WsProxy {
  handleOpen(msg: WsOpenMessage): void;
  handleData(msg: WsDataMessage): void;
  handleClose(msg: WsCloseMessage): void;
  closeAll(): void;
}

function extractSubprotocols(headers: Record<string, string>): string[] {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === "sec-websocket-protocol") {
      return v
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }
  return [];
}

export function createWsProxy(
  port: number,
  send: (msg: DaemonToRelayMessage) => void,
  basePath?: string,
): WsProxy {
  const connections = new Map<string, WebSocket>();
  const sendClose = (id: string, close: ReturnType<typeof normalizeWebSocketCloseFrame>): void => {
    const msg: DaemonToRelayMessage = { type: "ws-close", id, code: close.code };
    if (close.reason !== undefined) msg.reason = close.reason;
    send(msg);
  };

  return {
    handleOpen(msg) {
      const existing = connections.get(msg.id);
      if (existing) {
        existing.close();
        connections.delete(msg.id);
      }

      const proxyPath = basePath ? `${basePath}${msg.path.slice(1)}` : msg.path;
      const url = `ws://localhost:${port}${proxyPath}`;
      const subprotocols = extractSubprotocols(msg.headers);
      const ws = subprotocols.length > 0 ? new WebSocket(url, subprotocols) : new WebSocket(url);

      ws.onopen = () => {
        connections.set(msg.id, ws);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          send({
            type: "ws-data",
            id: msg.id,
            data: uint8ToBase64(new Uint8Array(event.data)),
            binary: true,
          });
        } else {
          send({ type: "ws-data", id: msg.id, data: String(event.data), binary: false });
        }
      };

      ws.onclose = (event: CloseEvent) => {
        connections.delete(msg.id);
        const close = normalizeWebSocketCloseFrame({ code: event.code, reason: event.reason });
        sendClose(msg.id, close);
      };

      ws.onerror = () => {
        connections.delete(msg.id);
        const close = normalizeWebSocketCloseFrame({
          code: TUNNEL_ABNORMAL_WS_CLOSE_CODE,
          reason: "Local WebSocket error",
        });
        sendClose(msg.id, close);
      };
    },

    handleData(msg) {
      const ws = connections.get(msg.id);
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      if (msg.binary) {
        const bytes = Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0));
        ws.send(bytes);
      } else {
        ws.send(msg.data);
      }
    },

    handleClose(msg) {
      const ws = connections.get(msg.id);
      if (!ws) return;
      connections.delete(msg.id);
      const close = normalizeWebSocketCloseFrame({ code: msg.code, reason: msg.reason });
      ws.close(close.code, close.reason);
    },

    closeAll() {
      for (const [id, ws] of connections) {
        const close = normalizeWebSocketCloseFrame({
          code: TUNNEL_ABNORMAL_WS_CLOSE_CODE,
          reason: "Tunnel closing",
        });
        ws.close(close.code, close.reason);
        connections.delete(id);
      }
    },
  };
}
