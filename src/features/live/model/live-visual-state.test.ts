import { describe, expect, it } from "vitest";
import { resolveLiveVisualState } from "./live-visual-state";

const NOW = 1_700_000_000_000;

describe("resolveLiveVisualState", () => {
  it("returns connecting while bridge is connecting", () => {
    expect(
      resolveLiveVisualState({
        bridgeState: "connecting",
        hasCanvasContent: false,
        lastAgentActivityAt: null,
        lastUserDeliveredAt: null,
        now: NOW,
      }),
    ).toBe("connecting");
  });

  it("returns disconnected when bridge is disconnected or closed", () => {
    expect(
      resolveLiveVisualState({
        bridgeState: "disconnected",
        hasCanvasContent: true,
        lastAgentActivityAt: NOW,
        lastUserDeliveredAt: NOW,
        now: NOW,
      }),
    ).toBe("disconnected");

    expect(
      resolveLiveVisualState({
        bridgeState: "closed",
        hasCanvasContent: true,
        lastAgentActivityAt: NOW,
        lastUserDeliveredAt: NOW,
        now: NOW,
      }),
    ).toBe("disconnected");
  });

  it("returns agent-thinking after recent delivered user message with no agent activity", () => {
    expect(
      resolveLiveVisualState({
        bridgeState: "connected",
        hasCanvasContent: false,
        lastAgentActivityAt: null,
        lastUserDeliveredAt: NOW - 1_000,
        now: NOW,
      }),
    ).toBe("agent-thinking");
  });

  it("returns agent-replying on recent agent activity", () => {
    expect(
      resolveLiveVisualState({
        bridgeState: "connected",
        hasCanvasContent: false,
        lastAgentActivityAt: NOW - 500,
        lastUserDeliveredAt: NOW - 20_000,
        now: NOW,
      }),
    ).toBe("agent-replying");
  });

  it("returns agent-thinking when user sent recently but agent activity was before", () => {
    expect(
      resolveLiveVisualState({
        bridgeState: "connected",
        hasCanvasContent: true,
        lastAgentActivityAt: NOW - 8_000,
        lastUserDeliveredAt: NOW - 2_000,
        now: NOW,
      }),
    ).toBe("agent-thinking");
  });

  it("returns idle when there is no recent activity", () => {
    expect(
      resolveLiveVisualState({
        bridgeState: "connected",
        hasCanvasContent: true,
        lastAgentActivityAt: NOW - 20_000,
        lastUserDeliveredAt: NOW - 20_000,
        now: NOW,
      }),
    ).toBe("idle");
  });

  it("returns waiting-content when connected and no canvas content yet", () => {
    expect(
      resolveLiveVisualState({
        bridgeState: "connected",
        hasCanvasContent: false,
        lastAgentActivityAt: NOW - 20_000,
        lastUserDeliveredAt: NOW - 20_000,
        now: NOW,
      }),
    ).toBe("waiting-content");
  });

  it("agent-replying at exact 4s boundary, idle at 4s+1ms", () => {
    expect(
      resolveLiveVisualState({
        bridgeState: "connected",
        hasCanvasContent: true,
        lastAgentActivityAt: NOW - 4_000,
        lastUserDeliveredAt: null,
        now: NOW,
      }),
    ).toBe("agent-replying");

    expect(
      resolveLiveVisualState({
        bridgeState: "connected",
        hasCanvasContent: true,
        lastAgentActivityAt: NOW - 4_001,
        lastUserDeliveredAt: null,
        now: NOW,
      }),
    ).toBe("idle");
  });

  it("agent-thinking at exact 12s boundary, idle at 12s+1ms", () => {
    expect(
      resolveLiveVisualState({
        bridgeState: "connected",
        hasCanvasContent: true,
        lastAgentActivityAt: null,
        lastUserDeliveredAt: NOW - 12_000,
        now: NOW,
      }),
    ).toBe("agent-thinking");

    expect(
      resolveLiveVisualState({
        bridgeState: "connected",
        hasCanvasContent: true,
        lastAgentActivityAt: null,
        lastUserDeliveredAt: NOW - 12_001,
        now: NOW,
      }),
    ).toBe("idle");
  });
});
