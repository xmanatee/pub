import { describe, expect, it } from "vitest";
import type { LiveInfo } from "./api.js";
import { decideSignalingUpdate } from "./live-signaling.js";

function makeLive(overrides: Partial<LiveInfo> = {}): LiveInfo {
  return {
    slug: "demo",
    status: "active",
    browserOffer: "offer-v1",
    agentAnswer: "answer-v1",
    browserCandidates: [],
    agentCandidates: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe("decideSignalingUpdate", () => {
  it("recovers when pending browser offer arrives and no prior offer was applied", () => {
    const decision = decideSignalingUpdate({
      live: makeLive({ agentAnswer: undefined }),
      activeSlug: null,
      lastAppliedBrowserOffer: null,
      lastBrowserCandidateCount: 0,
    });

    expect(decision.type).toBe("recover");
    if (decision.type !== "recover") return;
    expect(decision.slug).toBe("demo");
    expect(decision.browserOffer).toBe("offer-v1");
    expect(decision.nextBrowserCandidateCount).toBe(0);
  });

  it("does not recover when pending offer did not change", () => {
    const decision = decideSignalingUpdate({
      live: makeLive({ agentAnswer: undefined }),
      activeSlug: "demo",
      lastAppliedBrowserOffer: "offer-v1",
      lastBrowserCandidateCount: 0,
    });

    expect(decision).toEqual({
      type: "noop",
      nextBrowserCandidateCount: 0,
    });
  });

  it("applies new browser ICE candidates for active slug", () => {
    const decision = decideSignalingUpdate({
      live: makeLive({
        browserCandidates: ["c1", "c2", "c3"],
      }),
      activeSlug: "demo",
      lastAppliedBrowserOffer: "offer-v1",
      lastBrowserCandidateCount: 1,
    });

    expect(decision.type).toBe("apply-browser-candidates");
    if (decision.type !== "apply-browser-candidates") return;
    expect(decision.candidatePayloads).toEqual(["c2", "c3"]);
    expect(decision.nextBrowserCandidateCount).toBe(3);
  });

  it("ignores candidates from another slug", () => {
    const decision = decideSignalingUpdate({
      live: makeLive({
        slug: "other",
        browserCandidates: ["c1", "c2"],
      }),
      activeSlug: "demo",
      lastAppliedBrowserOffer: "offer-v1",
      lastBrowserCandidateCount: 0,
    });

    expect(decision).toEqual({
      type: "noop",
      nextBrowserCandidateCount: 0,
    });
  });
});
