import { describe, expect, it } from "vitest";
import { resolveAckChannel } from "./ack-routing.js";
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
