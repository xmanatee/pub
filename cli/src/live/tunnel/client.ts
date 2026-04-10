import type { DaemonToRelayMessage } from "../../../../shared/tunnel-protocol-core";
import {
  encodeTunnelMessage,
  parseRelayToDaemonMessage,
  type RelayToDaemonMessage,
} from "../../../../shared/tunnel-protocol-core";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const KEEPALIVE_INTERVAL_MS = 30_000;

export interface TunnelConnection {
  send(msg: DaemonToRelayMessage): void;
  close(): Promise<void>;
  readonly connected: boolean;
}

export interface TunnelClientOptions {
  relayUrl: string;
  apiKey: string;
  daemonSessionId: string;
  onMessage: (msg: RelayToDaemonMessage) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  debugLog?: (message: string) => void;
}

export function connectTunnel(options: TunnelClientOptions): TunnelConnection {
  const { relayUrl, apiKey, daemonSessionId, onMessage, onConnected, onDisconnected, debugLog } =
    options;

  let ws: WebSocket | null = null;
  let stopped = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  function clearKeepalive(): void {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  }

  function startKeepalive(): void {
    clearKeepalive();
    keepaliveTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(encodeTunnelMessage({ type: "pong" }));
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  function connect(): void {
    if (stopped) return;

    const params = new URLSearchParams({ apiKey, sessionId: daemonSessionId });
    const wsUrl = `${relayUrl.replace(/^http/, "ws")}/daemon?${params}`;
    debugLog?.(`connecting to ${wsUrl.replace(/apiKey=[^&]+/, "apiKey=***")}`);

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      reconnectAttempt = 0;
      startKeepalive();
      debugLog?.("connected");
      onConnected?.();
    };

    ws.onmessage = (event: MessageEvent) => {
      let raw: string;
      if (typeof event.data === "string") {
        raw = event.data;
      } else if (typeof event.data === "object" && event.data instanceof ArrayBuffer) {
        raw = new TextDecoder().decode(event.data);
      } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(event.data)) {
        raw = (event.data as Buffer).toString("utf-8");
      } else {
        raw = String(event.data);
      }
      const msg = parseRelayToDaemonMessage(raw);
      if (!msg) return;

      if (msg.type === "ping") {
        ws?.send(encodeTunnelMessage({ type: "pong" }));
        return;
      }

      onMessage(msg);
    };

    ws.onclose = () => {
      clearKeepalive();
      onDisconnected?.();
      scheduleReconnect();
    };

    ws.onerror = (event) => {
      debugLog?.(`error: ${event instanceof ErrorEvent ? event.message : "connection error"}`);
    };
  }

  function scheduleReconnect(): void {
    if (stopped) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
    reconnectAttempt++;
    debugLog?.(`reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
    reconnectTimer = setTimeout(connect, delay);
  }

  connect();

  return {
    get connected() {
      return ws?.readyState === WebSocket.OPEN;
    },

    send(msg: DaemonToRelayMessage): void {
      if (ws?.readyState !== WebSocket.OPEN) return;
      ws.send(encodeTunnelMessage(msg));
    },

    async close(): Promise<void> {
      stopped = true;
      clearKeepalive();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        ws = null;
      }
    },
  };
}
