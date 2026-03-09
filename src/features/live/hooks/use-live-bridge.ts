import { useEffect, useRef, useState } from "react";
import { type DeliveryReceiptPayload } from "~/features/live/lib/bridge-protocol";
import type { BridgeState, ChannelMessage } from "~/features/live/lib/webrtc-browser";
import { BrowserBridge } from "~/features/live/lib/webrtc-browser";
import { trackError } from "~/lib/analytics";

interface UseLiveBridgeOptions {
  slug: string;
  enabled: boolean;
  connectionAttempt: number;
  agentAnswer: string | undefined;
  agentCandidates: string[] | undefined;
  storeBrowserOffer: (input: { slug: string; offer: string }) => Promise<unknown>;
  storeBrowserCandidates: (input: { slug: string; candidates: string[] }) => Promise<unknown>;
  onDeliveryReceipt: (receipt: DeliveryReceiptPayload) => void;
  onMessage: (message: ChannelMessage) => void;
  onSystemMessage?: (params: {
    content: string;
    dedupeKey?: string;
    severity: "warning" | "error";
  }) => void;
  onTrackActivity: () => void;
}

export function useLiveBridge({
  slug,
  enabled,
  connectionAttempt,
  agentAnswer,
  agentCandidates,
  storeBrowserOffer,
  storeBrowserCandidates,
  onDeliveryReceipt,
  onMessage,
  onSystemMessage,
  onTrackActivity,
}: UseLiveBridgeOptions) {
  const bridgeRef = useRef<BrowserBridge | null>(null);
  const [bridgeState, setBridgeState] = useState<BridgeState>("connecting");

  const onDeliveryReceiptRef = useRef(onDeliveryReceipt);
  const onMessageRef = useRef(onMessage);
  const onSystemMessageRef = useRef(onSystemMessage);
  const onTrackActivityRef = useRef(onTrackActivity);
  const storeBrowserOfferRef = useRef(storeBrowserOffer);
  const storeBrowserCandidatesRef = useRef(storeBrowserCandidates);

  const lastAgentCandidateCountRef = useRef(0);
  const lastHandledAnswerRef = useRef<string | null>(null);
  const localIceFlushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localIceStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onDeliveryReceiptRef.current = onDeliveryReceipt;
  onMessageRef.current = onMessage;
  onSystemMessageRef.current = onSystemMessage;
  onTrackActivityRef.current = onTrackActivity;
  storeBrowserOfferRef.current = storeBrowserOffer;
  storeBrowserCandidatesRef.current = storeBrowserCandidates;

  // Browser is the offerer in this signaling flow.
  // biome-ignore lint/correctness/useExhaustiveDependencies: connectionAttempt is a prop used to force reconnection
  useEffect(() => {
    if (!enabled) return;
    setBridgeState("connecting");

    const bridge = new BrowserBridge();
    bridgeRef.current = bridge;
    lastAgentCandidateCountRef.current = 0;
    lastHandledAnswerRef.current = null;
    bridge.setOnStateChange(setBridgeState);
    bridge.setOnMessage((message) => onMessageRef.current(message));
    bridge.setOnTrack(() => onTrackActivityRef.current());
    bridge.setOnDeliveryReceipt((receipt) => onDeliveryReceiptRef.current(receipt));

    void (async () => {
      try {
        const offer = await bridge.createOffer();
        await storeBrowserOfferRef.current({ slug, offer });
        bridge.markOfferSent();

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
            onSystemMessageRef.current?.({
              content: "Realtime signaling is unstable. Local connection updates are failing.",
              dedupeKey: "local-ice-store-failed",
              severity: "warning",
            });
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
        onSystemMessageRef.current?.({
          content: "Live connection setup failed before streaming could start.",
          dedupeKey: "bridge-offer-failed",
          severity: "error",
        });
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
  }, [enabled, slug, connectionAttempt]);

  // Sync agent signaling data (answer + ICE candidates) to the bridge
  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;

    if (agentAnswer) {
      const answerKey = `${slug}:${agentAnswer}`;
      if (lastHandledAnswerRef.current !== answerKey) {
        lastHandledAnswerRef.current = answerKey;
        void bridge.applyAnswer(agentAnswer).catch((error) => {
          trackError(error instanceof Error ? error : new Error("Failed to apply agent answer"), {
            context: "live-bridge",
          });
          onSystemMessageRef.current?.({
            content: "Live connection could not apply the remote answer. Reconnect and try again.",
            dedupeKey: "bridge-answer-failed",
            severity: "error",
          });
        });
      }
    }

    if (agentCandidates) {
      const nextCandidates = agentCandidates.slice(lastAgentCandidateCountRef.current);
      if (nextCandidates.length > 0) {
        lastAgentCandidateCountRef.current = agentCandidates.length;
        void bridge.addRemoteCandidates(nextCandidates).catch((error) => {
          console.warn("Failed to add remote ICE candidates", error);
          onSystemMessageRef.current?.({
            content: "Connection updates from the agent were rejected. Stream quality may degrade.",
            dedupeKey: "remote-ice-add-failed",
            severity: "warning",
          });
        });
      }
    }
  }, [agentAnswer, agentCandidates, slug]);

  return {
    bridgeRef,
    bridgeState,
  };
}
