import type {
  DaemonToRelayMessage,
  WsCloseMessage,
  WsDataMessage,
  WsOpenMessage,
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
        send({ type: "ws-close", id: msg.id, code: event.code, reason: event.reason });
      };

      ws.onerror = () => {
        connections.delete(msg.id);
        send({ type: "ws-close", id: msg.id, code: 1011, reason: "Local WebSocket error" });
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
      ws.close(msg.code ?? 1000, msg.reason);
    },

    closeAll() {
      for (const [id, ws] of connections) {
        ws.close(1001, "Tunnel closing");
        connections.delete(id);
      }
    },
  };
}
