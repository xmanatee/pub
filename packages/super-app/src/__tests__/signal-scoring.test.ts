/**
 * Pin the signal-scoring weights and threshold. Behavior change here is a
 * deliberate UX call; the test makes the change visible in code review.
 */
import { describe, expect, it } from "vitest";
import {
  AUTO_SURFACE_THRESHOLD,
  rankActions,
  SIGNAL_WEIGHTS,
  score,
} from "~/core/ai/signal-scoring";

describe("signal-scoring", () => {
  it("pins the weights", () => {
    expect(SIGNAL_WEIGHTS).toEqual({
      date: 0.18,
      action: 0.18,
      reference: 0.1,
      question: 0.12,
      serviceMatch: 0.18,
      serviceAdjacent: 0.08,
    });
    expect(AUTO_SURFACE_THRESHOLD).toBeCloseTo(0.62);
  });

  it("scores a date+action+question excerpt above the auto-surface threshold", () => {
    const s = score("Should we review the design tomorrow?", "create-task", "tasks");
    expect(s).toBeGreaterThanOrEqual(AUTO_SURFACE_THRESHOLD);
  });

  it("ranks actions descending by score", () => {
    const ranked = rankActions("remind me tomorrow about the design review", "mail", [
      "create-task",
      "draft-email",
      "create-event",
      "create-note",
    ]);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });
});
