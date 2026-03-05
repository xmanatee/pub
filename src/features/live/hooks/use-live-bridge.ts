import { useEffect, useRef, useState } from "react";
import { trackError } from "~/lib/analytics";
import {
  type BridgeMessageMeta,
  CONTROL_CHANNEL,
  type DeliveryAckPayload,
  makeEventMessage,
  type SessionContextPayload,
} from "~/lib/bridge-protocol";
import type { BridgeState, ChannelMessage } from "~/lib/webrtc-browser";
import { BrowserBridge } from "~/lib/webrtc-browser";

interface UseLiveBridgeOptions {
  slug: string;
  enabled: boolean;
  agentAnswer: string | undefined;
  agentCandidates: string[] | undefined;
  sessionContext?: SessionContextPayload;
  storeBrowserOffer: (input: { slug: string; offer: string }) => Promise<unknown>;
  storeBrowserCandidates: (input: { slug: string; candidates: string[] }) => Promise<unknown>;
  onDeliveryAck: (ack: DeliveryAckPayload) => void;
  onMessage: (message: ChannelMessage) => void;
  onTrackActivity: () => void;
}

export function useLiveBridge({
  slug,
  enabled,
  agentAnswer,
  agentCandidates,
  sessionContext,
  storeBrowserOffer,
  storeBrowserCandidates,
  onDeliveryAck,
  onMessage,
  onTrackActivity,
}: UseLiveBridgeOptions) {
  const bridgeRef = useRef<BrowserBridge | null>(null);
  const [bridgeState, setBridgeState] = useState<BridgeState>("connecting");
  const sessionContextSentRef = useRef(false);

  const onDeliveryAckRef = useRef(onDeliveryAck);
  const onMessageRef = useRef(onMessage);
  const onTrackActivityRef = useRef(onTrackActivity);
  const storeBrowserOfferRef = useRef(storeBrowserOffer);
  const storeBrowserCandidatesRef = useRef(storeBrowserCandidates);

  const lastAgentCandidateCountRef = useRef(0);
  const lastHandledAnswerRef = useRef<string | null>(null);
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
    storeBrowserOfferRef.current = storeBrowserOffer;
  }, [storeBrowserOffer]);

  useEffect(() => {
    storeBrowserCandidatesRef.current = storeBrowserCandidates;
  }, [storeBrowserCandidates]);

  // Browser is the offerer in this signaling flow.
  useEffect(() => {
    if (!enabled) return;
    setBridgeState("connecting");

    const bridge = new BrowserBridge();
    bridgeRef.current = bridge;
    lastAgentCandidateCountRef.current = 0;
    lastHandledAnswerRef.current = null;
    sessionContextSentRef.current = false;
    bridge.setOnStateChange(setBridgeState);
    bridge.setOnMessage((message) => onMessageRef.current(message));
    bridge.setOnTrack(() => onTrackActivityRef.current());
    bridge.setOnDeliveryAck((ack) => onDeliveryAckRef.current(ack));

    void (async () => {
      try {
        const offer = await bridge.createOffer();
        await storeBrowserOfferRef.current({ slug, offer });

        // Start ICE candidate flush
        const flushedCandidates: string[] = [];
        const initialCandidates = bridge.getIceCandidates();
        if (initialCandidates.length > 0) {
          flushedCandidates.push(...initialCandidates);
          await storeBrowserCandidatesRef.current({ slug, candidates: initialCandidates });
        }

        if (localIceFlushIntervalRef.current) clearInterval(localIceFlushIntervalRef.current);
        if (localIceStopTimeoutRef.current) clearTimeout(localIceStopTimeoutRef.current);

        const flushLocalCandidates = async () => {
          try {
            const current = bridge.getIceCandidates();
            if (current.length <= flushedCandidates.length) return;
            const next = current.slice(flushedCandidates.length);
            flushedCandidates.push(...next);
            await storeBrowserCandidatesRef.current({ slug, candidates: next });
          } catch (error) {
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
        trackError(
          error instanceof Error ? error : new Error("Failed to create live WebRTC offer"),
          { context: "live-bridge" },
        );
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
  }, [enabled, slug]);

  // Apply agent answer when it arrives
  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!agentAnswer || !bridge) return;

    const answerKey = `${slug}:${agentAnswer}`;
    if (lastHandledAnswerRef.current === answerKey) return;
    lastHandledAnswerRef.current = answerKey;

    void bridge.applyAnswer(agentAnswer).catch((error) => {
      trackError(error instanceof Error ? error : new Error("Failed to apply agent answer"), {
        context: "live-bridge",
      });
    });
  }, [agentAnswer, slug]);

  // Add remote ICE candidates
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

  // Send session context once after connection
  useEffect(() => {
    if (bridgeState !== "connected" || !sessionContext || sessionContextSentRef.current) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const msg = makeEventMessage("session-context", sessionContext as BridgeMessageMeta);
    const sent = bridge.send(CONTROL_CHANNEL, msg);
    if (sent) sessionContextSentRef.current = true;
  }, [bridgeState, sessionContext]);

  return {
    bridgeRef,
    bridgeState,
  };
}
