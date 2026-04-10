import { type BridgeMessage, parseBridgeMessage } from "@shared/bridge-protocol-core";

export type TunnelChannelHandler = (channel: string, message: BridgeMessage) => void;
export type TunnelBinaryHandler = (channel: string, data: Uint8Array) => void;

export interface BrowserTunnelClient {
  sendChannel(channel: string, message: BridgeMessage): void;
  close(): void;
  readonly connected: boolean;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

export function createBrowserTunnelClient(
  relayWsUrl: string,
  onMessage: TunnelChannelHandler,
  onBinaryMessage: TunnelBinaryHandler | undefined,
  onConnectedChange?: (connected: boolean) => void,
): BrowserTunnelClient {
  let ws: WebSocket | null = null;
  let stopped = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect(): void {
    if (stopped) return;

    ws = new WebSocket(relayWsUrl);

    ws.onopen = () => {
      reconnectAttempt = 0;
      onConnectedChange?.(true);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const obj = safeJsonParse(event.data);
      if (!obj || typeof obj.channel !== "string") return;

      if (obj.type === "channel-binary" && typeof obj.data === "string") {
        onBinaryMessage?.(obj.channel as string, base64ToUint8Array(obj.data as string));
        return;
      }

      if (obj.type === "channel" && obj.message) {
        const msg = parseBridgeMessage(obj.message);
        if (msg) onMessage(obj.channel as string, msg);
      }
    };

    ws.onclose = () => {
      onConnectedChange?.(false);
      scheduleReconnect();
    };

    ws.onerror = () => {};
  }

  function scheduleReconnect(): void {
    if (stopped) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
    reconnectAttempt++;
    reconnectTimer = setTimeout(connect, delay);
  }

  connect();

  return {
    get connected() {
      return ws?.readyState === WebSocket.OPEN;
    },

    sendChannel(channel: string, message: BridgeMessage): void {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "channel", channel, message }));
    },

    close(): void {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }
    },
  };
}

function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
