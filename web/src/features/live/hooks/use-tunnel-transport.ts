import {
  type BridgeMessage,
  CONTROL_CHANNEL,
  makeAckMessage,
  makeTextMessage,
  parseStatusMessage,
  type StatusPayload,
  shouldAcknowledgeMessage,
} from "@shared/bridge-protocol-core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BrowserTunnelClient,
  createBrowserTunnelClient,
} from "~/features/live/lib/tunnel-client";

export interface TunnelTransportState {
  connected: boolean;
  agentStatus: StatusPayload | null;
  sendChat: (text: string) => void;
  sendOnChannel: (channel: string, msg: BridgeMessage) => void;
  onChannelMessage: React.MutableRefObject<((channel: string, msg: BridgeMessage) => void) | null>;
}

export function useTunnelTransport(tunnelWsUrl: string | null): TunnelTransportState {
  const [connected, setConnected] = useState(false);
  const [agentStatus, setAgentStatus] = useState<StatusPayload | null>(null);
  const clientRef = useRef<BrowserTunnelClient | null>(null);
  const onChannelMessage = useRef<((channel: string, msg: BridgeMessage) => void) | null>(null);

  useEffect(() => {
    if (!tunnelWsUrl) return;

    const client = createBrowserTunnelClient(
      tunnelWsUrl,
      (channel, msg) => {
        if (channel === CONTROL_CHANNEL) {
          const status = parseStatusMessage(msg);
          if (status) {
            setAgentStatus(status);
            return;
          }
        }

        if (shouldAcknowledgeMessage(channel, msg)) {
          client.sendChannel(CONTROL_CHANNEL, makeAckMessage(msg.id, channel));
        }

        onChannelMessage.current?.(channel, msg);
      },
      setConnected,
    );

    clientRef.current = client;

    return () => {
      client.close();
      clientRef.current = null;
      setConnected(false);
      setAgentStatus(null);
    };
  }, [tunnelWsUrl]);

  const sendChat = useCallback((text: string) => {
    clientRef.current?.sendChannel("chat", makeTextMessage(text));
  }, []);

  const sendOnChannel = useCallback((channel: string, msg: BridgeMessage) => {
    clientRef.current?.sendChannel(channel, msg);
  }, []);

  return { connected, agentStatus, sendChat, sendOnChannel, onChannelMessage };
}
