import { describe, expect, it } from "vitest";
import {
  getTunnelWriteReadinessError,
  shouldRecoverForBrowserAnswerChange,
} from "./tunnel-daemon.js";

describe("getTunnelWriteReadinessError", () => {
  it("blocks writes before browser connection", () => {
    expect(getTunnelWriteReadinessError(false)).toBe(
      "No browser connected. Ask the user to open the tunnel URL first, then retry.",
    );
  });

  it("allows writes after browser connection", () => {
    expect(getTunnelWriteReadinessError(true)).toBeNull();
  });
});

describe("shouldRecoverForBrowserAnswerChange", () => {
  it("does not trigger before remote description is applied", () => {
    expect(
      shouldRecoverForBrowserAnswerChange({
        incomingBrowserAnswer: "answer-v2",
        lastAppliedBrowserAnswer: "answer-v1",
        remoteDescriptionApplied: false,
      }),
    ).toBe(false);
  });

  it("does not trigger when answer has not changed", () => {
    expect(
      shouldRecoverForBrowserAnswerChange({
        incomingBrowserAnswer: "answer-v1",
        lastAppliedBrowserAnswer: "answer-v1",
        remoteDescriptionApplied: true,
      }),
    ).toBe(false);
  });

  it("triggers when a new browser answer arrives after apply", () => {
    expect(
      shouldRecoverForBrowserAnswerChange({
        incomingBrowserAnswer: "answer-v2",
        lastAppliedBrowserAnswer: "answer-v1",
        remoteDescriptionApplied: true,
      }),
    ).toBe(true);
  });
});
