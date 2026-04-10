import type { BridgeMessage } from "@shared/bridge-protocol-core";
import {
  type DaemonToRelayMessage,
  encodeTunnelMessage,
  parseDaemonToRelayMessage,
} from "@shared/tunnel-protocol-core";

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

  function handleDaemonMessage(msg: DaemonToRelayMessage): void {
    switch (msg.type) {
      case "channel":
        onMessage(msg.channel, msg.message);
        break;
      case "channel-binary":
        onBinaryMessage?.(msg.channel, base64ToUint8Array(msg.data));
        break;
    }
  }

  function connect(): void {
    if (stopped) return;

    ws = new WebSocket(relayWsUrl);

    ws.onopen = () => {
      reconnectAttempt = 0;
      onConnectedChange?.(true);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const msg = parseDaemonToRelayMessage(event.data);
      if (msg) handleDaemonMessage(msg);
    };

    ws.onclose = () => {
      onConnectedChange?.(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      onConnectedChange?.(false);
    };
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
      ws.send(encodeTunnelMessage({ type: "channel", channel, message }));
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

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
