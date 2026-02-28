import { useEffect, useRef, useState } from "react";
import type { DeliveryAckPayload } from "~/lib/bridge-protocol";
import type { BridgeState, ChannelMessage } from "~/lib/webrtc-browser";
import { BrowserBridge } from "~/lib/webrtc-browser";

interface StoreBrowserSignalInput {
  answer?: string;
  candidates?: string[];
  tunnelId: string;
}

interface UseTunnelBridgeOptions {
  agentCandidates: string[] | undefined;
  agentOffer: string | undefined;
  onDeliveryAck: (ack: DeliveryAckPayload) => void;
  onMessage: (message: ChannelMessage) => void;
  onTrackActivity: () => void;
  storeBrowserSignal: (input: StoreBrowserSignalInput) => Promise<unknown>;
  tunnelId: string;
}

export function useTunnelBridge({
  agentCandidates,
  agentOffer,
  onDeliveryAck,
  onMessage,
  onTrackActivity,
  storeBrowserSignal,
  tunnelId,
}: UseTunnelBridgeOptions) {
  const bridgeRef = useRef<BrowserBridge | null>(null);
  const [bridgeState, setBridgeState] = useState<BridgeState>("connecting");

  const lastAgentCandidateCountRef = useRef(0);
  const lastHandledOfferRef = useRef<string | null>(null);
  const localIceFlushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localIceStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!agentOffer || lastHandledOfferRef.current === agentOffer) return;
    lastHandledOfferRef.current = agentOffer;

    const bridge = new BrowserBridge();
    bridgeRef.current = bridge;
    lastAgentCandidateCountRef.current = 0;
    bridge.setOnStateChange(setBridgeState);
    bridge.setOnMessage(onMessage);
    bridge.setOnTrack(() => onTrackActivity());
    bridge.setOnDeliveryAck(onDeliveryAck);

    void (async () => {
      try {
        const answer = await bridge.createAnswer(agentOffer);
        await storeBrowserSignal({ tunnelId, answer });
        const candidates = bridge.getIceCandidates();
        if (candidates.length > 0) await storeBrowserSignal({ tunnelId, candidates });

        if (localIceFlushIntervalRef.current) clearInterval(localIceFlushIntervalRef.current);
        if (localIceStopTimeoutRef.current) clearTimeout(localIceStopTimeoutRef.current);

        const flushLocalCandidates = async () => {
          try {
            const current = bridge.getIceCandidates();
            if (current.length <= candidates.length) return;
            const next = current.slice(candidates.length);
            candidates.push(...next);
            await storeBrowserSignal({ tunnelId, candidates: next });
          } catch (error) {
            // Ignore transient signaling write failures; next interval retries.
            console.warn("Failed to store local ICE candidates", error);
          }
        };

        localIceFlushIntervalRef.current = setInterval(() => {
          void flushLocalCandidates();
        }, 500);

        localIceStopTimeoutRef.current = setTimeout(() => {
          if (localIceFlushIntervalRef.current) {
            clearInterval(localIceFlushIntervalRef.current);
            localIceFlushIntervalRef.current = null;
          }
          localIceStopTimeoutRef.current = null;
        }, 30_000);
      } catch (error) {
        // Failed to establish WebRTC answer/signaling for this offer.
        console.error("Failed to establish tunnel WebRTC bridge", error);
        setBridgeState("disconnected");
      }
    })();

    return () => {
      if (localIceFlushIntervalRef.current) {
        clearInterval(localIceFlushIntervalRef.current);
        localIceFlushIntervalRef.current = null;
      }
      if (localIceStopTimeoutRef.current) {
        clearTimeout(localIceStopTimeoutRef.current);
        localIceStopTimeoutRef.current = null;
      }
      bridge.close();
      bridgeRef.current = null;
    };
  }, [agentOffer, onDeliveryAck, onMessage, onTrackActivity, storeBrowserSignal, tunnelId]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!agentCandidates || !bridge) return;
    const nextCandidates = agentCandidates.slice(lastAgentCandidateCountRef.current);
    if (nextCandidates.length === 0) return;
    lastAgentCandidateCountRef.current = agentCandidates.length;
    void bridge.addRemoteCandidates(nextCandidates);
  }, [agentCandidates]);

  return {
    bridgeRef,
    bridgeState,
  };
}
