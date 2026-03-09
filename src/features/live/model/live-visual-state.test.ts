import { describe, expect, it } from "vitest";
import { resolveLiveVisualState } from "./live-visual-state";

const NOW = 1_700_000_000_000;

describe("resolveLiveVisualState", () => {
  it("returns content-loading while markdown content is still resolving", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: undefined,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "loading",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: false,
        now: NOW,
        transportStatus: "disabled",
      }),
    ).toBe("content-loading");
  });

  it("returns offline when no agent is available for owner live mode", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: false,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: NOW,
        transportStatus: "disabled",
      }),
    ).toBe("offline");
  });

  it("returns connecting while transport is connecting", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: NOW,
        transportStatus: "connecting",
      }),
    ).toBe("connecting");
  });

  it("returns disconnected when transport is disconnected", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: { at: NOW, kind: "text" },
        lastUserDeliveredAt: NOW,
        liveMode: true,
        now: NOW,
        transportStatus: "disconnected",
      }),
    ).toBe("disconnected");
  });

  it("returns recording while any recording mode is active", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: true,
        audioMode: "recording-paused",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: NOW,
        transportStatus: "connected",
      }),
    ).toBe("recording");
  });

  it("returns voice-mode while voice mode is active", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: true,
        audioMode: "starting-voice",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: NOW,
        transportStatus: "connected",
      }),
    ).toBe("voice-mode");
  });

  it("returns command-running while a command is active", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "running",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: NOW,
        transportStatus: "connected",
      }),
    ).toBe("command-running");
  });

  it("returns agent-thinking after a recent delivered user message with no newer output", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: NOW - 1_000,
        liveMode: true,
        now: NOW,
        transportStatus: "connected",
      }),
    ).toBe("agent-thinking");
  });

  it("returns agent-replying on recent user-visible agent output", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: { at: NOW - 500, kind: "text" },
        lastUserDeliveredAt: NOW - 20_000,
        liveMode: true,
        now: NOW,
        transportStatus: "connected",
      }),
    ).toBe("agent-replying");
  });

  it("ignores track-only activity for agent-replying", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: { at: NOW - 500, kind: "track" },
        lastUserDeliveredAt: NOW - 20_000,
        liveMode: true,
        now: NOW,
        transportStatus: "connected",
      }),
    ).toBe("idle");
  });

  it("returns waiting-content when connected and no content exists", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "empty",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: NOW - 20_000,
        liveMode: true,
        now: NOW,
        transportStatus: "connected",
      }),
    ).toBe("waiting-content");
  });

  it("returns error when an error is present and no higher-priority visual state applies", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: "Canvas exploded",
        lastAgentOutput: null,
        lastUserDeliveredAt: NOW - 20_000,
        liveMode: true,
        now: NOW,
        transportStatus: "connected",
      }),
    ).toBe("error");
  });

  it("returns idle when no recent activity or errors remain", () => {
    expect(
      resolveLiveVisualState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: { at: NOW - 20_000, kind: "text" },
        lastUserDeliveredAt: NOW - 20_000,
        liveMode: true,
        now: NOW,
        transportStatus: "connected",
      }),
    ).toBe("idle");
  });
});
