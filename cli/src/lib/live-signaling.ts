import type { LiveInfo } from "../../../shared/live-api-core";
import { shouldRecoverForBrowserOfferChange } from "./live-daemon-shared.js";

export type SignalingDecision =
  | {
      type: "noop";
      nextBrowserCandidateCount: number;
    }
  | {
      type: "clear-live";
      nextBrowserCandidateCount: number;
    }
  | {
      type: "recover";
      slug: string;
      browserOffer: string;
      nextBrowserCandidateCount: number;
    }
  | {
      type: "apply-browser-candidates";
      candidatePayloads: string[];
      nextBrowserCandidateCount: number;
    };

export function decideSignalingUpdate(params: {
  live: LiveInfo | null;
  activeSlug: string | null;
  lastAppliedBrowserOffer: string | null;
  lastBrowserCandidateCount: number;
}): SignalingDecision {
  const { live, activeSlug, lastAppliedBrowserOffer, lastBrowserCandidateCount } = params;
  if (!live) {
    if (
      activeSlug !== null ||
      lastAppliedBrowserOffer !== null ||
      lastBrowserCandidateCount > 0
    ) {
      return { type: "clear-live", nextBrowserCandidateCount: 0 };
    }
    return { type: "noop", nextBrowserCandidateCount: lastBrowserCandidateCount };
  }

  if (live.browserOffer && !live.agentAnswer) {
    const shouldRecover =
      !lastAppliedBrowserOffer ||
      shouldRecoverForBrowserOfferChange({
        incomingBrowserOffer: live.browserOffer,
        lastAppliedBrowserOffer,
      });
    if (shouldRecover) {
      return {
        type: "recover",
        slug: live.slug,
        browserOffer: live.browserOffer,
        nextBrowserCandidateCount: 0,
      };
    }
    return { type: "noop", nextBrowserCandidateCount: lastBrowserCandidateCount };
  }

  if (live.browserOffer && live.agentAnswer && live.slug === activeSlug) {
    if (live.browserCandidates.length > lastBrowserCandidateCount) {
      return {
        type: "apply-browser-candidates",
        candidatePayloads: live.browserCandidates.slice(lastBrowserCandidateCount),
        nextBrowserCandidateCount: live.browserCandidates.length,
      };
    }
  }

  return { type: "noop", nextBrowserCandidateCount: lastBrowserCandidateCount };
}
