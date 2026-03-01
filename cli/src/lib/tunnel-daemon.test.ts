import { describe, expect, it } from "vitest";
import { resolveAckChannel } from "./ack-routing.js";
import {
  getSignalPollDelayMs,
  getTunnelWriteReadinessError,
  shouldRecoverForBrowserAnswerChange,
} from "./tunnel-daemon-shared.js";

describe("getTunnelWriteReadinessError", () => {
  it("blocks writes before browser connection", () => {
    expect(getTunnelWriteReadinessError(false)).toBe(
      "No browser connected. Ask the user to open the pub URL first, then retry.",
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

describe("resolveAckChannel", () => {
  it("prefers message channel when available", () => {
    expect(
      resolveAckChannel({
        controlChannelOpen: true,
        messageChannelOpen: true,
        messageChannel: "chat",
      }),
    ).toBe("chat");
  });

  it("falls back to control channel when message channel is unavailable", () => {
    expect(
      resolveAckChannel({
        controlChannelOpen: true,
        messageChannelOpen: false,
        messageChannel: "chat",
      }),
    ).toBe("_control");
  });

  it("returns null when no channel can carry ack", () => {
    expect(
      resolveAckChannel({
        controlChannelOpen: false,
        messageChannelOpen: false,
        messageChannel: "chat",
      }),
    ).toBeNull();
  });
});

describe("getSignalPollDelayMs", () => {
  it("returns the base polling delay when retry-after is missing", () => {
    expect(getSignalPollDelayMs({ remoteDescriptionApplied: false })).toBe(5_000);
    expect(getSignalPollDelayMs({ remoteDescriptionApplied: true })).toBe(15_000);
  });

  it("honors retry-after when it exceeds the base delay", () => {
    expect(getSignalPollDelayMs({ remoteDescriptionApplied: false, retryAfterSeconds: 12 })).toBe(
      12_000,
    );
  });

  it("ignores non-positive retry-after values", () => {
    expect(getSignalPollDelayMs({ remoteDescriptionApplied: false, retryAfterSeconds: 0 })).toBe(
      5_000,
    );
    expect(getSignalPollDelayMs({ remoteDescriptionApplied: false, retryAfterSeconds: -1 })).toBe(
      5_000,
    );
  });
});
