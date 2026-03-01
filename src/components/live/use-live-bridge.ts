import { useEffect, useRef, useState } from "react";
import type { DeliveryAckPayload } from "~/lib/bridge-protocol";
import type { BridgeState, ChannelMessage } from "~/lib/webrtc-browser";
import { BrowserBridge } from "~/lib/webrtc-browser";

interface StoreBrowserSignalInput {
  answer?: string;
  candidates?: string[];
  slug: string;
}

interface UseLiveBridgeOptions {
  agentCandidates: string[] | undefined;
  agentOffer: string | undefined;
  onDeliveryAck: (ack: DeliveryAckPayload) => void;
  onMessage: (message: ChannelMessage) => void;
  onTrackActivity: () => void;
  storeBrowserSignal: (input: StoreBrowserSignalInput) => Promise<unknown>;
  slug: string;
}

export function useLiveBridge({
  agentCandidates,
  agentOffer,
  onDeliveryAck,
  onMessage,
  onTrackActivity,
  storeBrowserSignal,
  slug,
}: UseLiveBridgeOptions) {
  const bridgeRef = useRef<BrowserBridge | null>(null);
  const [bridgeState, setBridgeState] = useState<BridgeState>("connecting");

  const onDeliveryAckRef = useRef(onDeliveryAck);
  const onMessageRef = useRef(onMessage);
  const onTrackActivityRef = useRef(onTrackActivity);
  const storeBrowserSignalRef = useRef(storeBrowserSignal);

  const lastAgentCandidateCountRef = useRef(0);
  const lastHandledOfferRef = useRef<string | null>(null);
  const localIceFlushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localIceStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onDeliveryAckRef.current = onDeliveryAck;
  }, [onDeliveryAck]);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onTrackActivityRef.current = onTrackActivity;
  }, [onTrackActivity]);

  useEffect(() => {
    storeBrowserSignalRef.current = storeBrowserSignal;
  }, [storeBrowserSignal]);

  useEffect(() => {
    if (!agentOffer) return;
    const offerKey = `${slug}:${agentOffer}`;
    if (lastHandledOfferRef.current === offerKey) return;
    lastHandledOfferRef.current = offerKey;
    setBridgeState("connecting");

    const bridge = new BrowserBridge();
    bridgeRef.current = bridge;
    lastAgentCandidateCountRef.current = 0;
    bridge.setOnStateChange(setBridgeState);
    bridge.setOnMessage((message) => onMessageRef.current(message));
    bridge.setOnTrack(() => onTrackActivityRef.current());
    bridge.setOnDeliveryAck((ack) => onDeliveryAckRef.current(ack));

    void (async () => {
      try {
        const answer = await bridge.createAnswer(agentOffer);
        await storeBrowserSignalRef.current({ slug, answer });
        const candidates = bridge.getIceCandidates();
        if (candidates.length > 0) await storeBrowserSignalRef.current({ slug, candidates });

        if (localIceFlushIntervalRef.current) clearInterval(localIceFlushIntervalRef.current);
        if (localIceStopTimeoutRef.current) clearTimeout(localIceStopTimeoutRef.current);

        const flushLocalCandidates = async () => {
          try {
            const current = bridge.getIceCandidates();
            if (current.length <= candidates.length) return;
            const next = current.slice(candidates.length);
            candidates.push(...next);
            await storeBrowserSignalRef.current({ slug, candidates: next });
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
        console.error("Failed to establish live WebRTC bridge", error);
        bridge.close();
        if (bridgeRef.current === bridge) {
          bridgeRef.current = null;
        }
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
      if (bridgeRef.current === bridge) {
        bridgeRef.current = null;
      }
    };
  }, [agentOffer, slug]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!agentCandidates || !bridge) return;
    const nextCandidates = agentCandidates.slice(lastAgentCandidateCountRef.current);
    if (nextCandidates.length === 0) return;
    lastAgentCandidateCountRef.current = agentCandidates.length;
    void bridge.addRemoteCandidates(nextCandidates).catch((error) => {
      console.warn("Failed to add remote ICE candidates", error);
    });
  }, [agentCandidates]);

  return {
    bridgeRef,
    bridgeState,
  };
}
