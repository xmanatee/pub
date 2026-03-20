import { describe, expect, it } from "vitest";
import { resolveLiveBlobState } from "./live-blob-state";

describe("resolveLiveBlobState", () => {
  it("returns content-loading while static content is loading outside live mode", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: undefined,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "loading",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: false,
        now: 0,
        transportStatus: "disabled",
      }),
    ).toBe("content-loading");
  });

  it("returns waiting-content when static content is empty outside live mode", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: undefined,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "empty",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: false,
        now: 0,
        transportStatus: "disabled",
      }),
    ).toBe("waiting-content");
  });

  it("returns offline when the agent is unavailable", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: false,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: 0,
        transportStatus: "disabled",
      }),
    ).toBe("offline");
  });

  it("returns connecting while transport is connecting", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: 0,
        transportStatus: "connecting",
      }),
    ).toBe("connecting");
  });

  it("returns recording while recording is active or transitioning", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: true,
        audioMode: "recording-paused",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: 0,
        transportStatus: "connected",
      }),
    ).toBe("recording");
  });

  it("returns voice-mode while voice mode is active or transitioning", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: true,
        audioMode: "starting-voice",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: 0,
        transportStatus: "connected",
      }),
    ).toBe("voice-mode");
  });

  it("returns command-running while a command is in flight", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "running",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: 0,
        transportStatus: "connected",
      }),
    ).toBe("command-running");
  });

  it("returns agent-replying after recent agent output", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: { at: 10_000, kind: "text" },
        lastUserDeliveredAt: 5_000,
        liveMode: true,
        now: 12_000,
        transportStatus: "connected",
      }),
    ).toBe("agent-replying");
  });

  it("returns agent-thinking after recent delivered user input with no newer reply", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: 10_000,
        liveMode: true,
        now: 12_000,
        transportStatus: "connected",
      }),
    ).toBe("agent-thinking");
  });

  it("returns content-loading when live mode is active and content is loading", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "loading",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: 0,
        transportStatus: "connected",
      }),
    ).toBe("content-loading");
  });

  it("returns waiting-content when live mode is active and content is empty", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "empty",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: 0,
        transportStatus: "connected",
      }),
    ).toBe("waiting-content");
  });

  it("returns error when there is an active error and no higher-priority state", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: "boom",
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: 0,
        transportStatus: "connected",
      }),
    ).toBe("error");
  });

  it("falls back to idle when nothing else applies", () => {
    expect(
      resolveLiveBlobState({
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        now: 0,
        transportStatus: "connected",
      }),
    ).toBe("idle");
  });
});
