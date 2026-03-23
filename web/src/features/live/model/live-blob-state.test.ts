import { describe, expect, it } from "vitest";
import { resolveLiveBlobState } from "./live-blob-state";

describe("resolveLiveBlobState", () => {
  it("returns content-loading while static content is loading outside live mode", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "idle",
        agentOnline: undefined,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "loading",
        errorMessage: null,
        liveMode: false,
        transportStatus: "disabled",
      }),
    ).toBe("content-loading");
  });

  it("returns waiting-content when static content is empty outside live mode", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "idle",
        agentOnline: undefined,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "empty",
        errorMessage: null,
        liveMode: false,
        transportStatus: "disabled",
      }),
    ).toBe("waiting-content");
  });

  it("returns offline when the agent is unavailable", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "idle",
        agentOnline: false,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        liveMode: true,
        transportStatus: "disabled",
      }),
    ).toBe("offline");
  });

  it("returns connecting while transport is connecting", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "idle",
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        liveMode: true,
        transportStatus: "connecting",
      }),
    ).toBe("connecting");
  });

  it("returns recording while recording is active or transitioning", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "idle",
        agentOnline: true,
        audioMode: "recording-paused",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        liveMode: true,
        transportStatus: "connected",
      }),
    ).toBe("recording");
  });

  it("returns voice-mode while voice mode is active or transitioning", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "idle",
        agentOnline: true,
        audioMode: "starting-voice",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        liveMode: true,
        transportStatus: "connected",
      }),
    ).toBe("voice-mode");
  });

  it("returns command-running while a command is in flight", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "idle",
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "running",
        contentState: "ready",
        errorMessage: null,
        liveMode: true,
        transportStatus: "connected",
      }),
    ).toBe("command-running");
  });

  it("returns agent-replying when agent activity is streaming", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "streaming",
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        liveMode: true,
        transportStatus: "connected",
      }),
    ).toBe("agent-replying");
  });

  it("returns agent-thinking when agent activity is thinking", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "thinking",
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        liveMode: true,
        transportStatus: "connected",
      }),
    ).toBe("agent-thinking");
  });

  it("returns content-loading when live mode is active and content is loading", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "idle",
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "loading",
        errorMessage: null,
        liveMode: true,
        transportStatus: "connected",
      }),
    ).toBe("content-loading");
  });

  it("returns waiting-content when live mode is active and content is empty", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "idle",
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "empty",
        errorMessage: null,
        liveMode: true,
        transportStatus: "connected",
      }),
    ).toBe("waiting-content");
  });

  it("returns error when there is an active error and no higher-priority state", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "idle",
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: "boom",
        liveMode: true,
        transportStatus: "connected",
      }),
    ).toBe("error");
  });

  it("falls back to idle when nothing else applies", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "idle",
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        liveMode: true,
        transportStatus: "connected",
      }),
    ).toBe("idle");
  });

  it("prioritizes command-running over agent activity", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "streaming",
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "running",
        contentState: "ready",
        errorMessage: null,
        liveMode: true,
        transportStatus: "connected",
      }),
    ).toBe("command-running");
  });

  it("ignores agent activity when not in live mode", () => {
    expect(
      resolveLiveBlobState({
        agentActivity: "streaming",
        agentOnline: true,
        audioMode: "idle",
        commandPhase: "idle",
        contentState: "ready",
        errorMessage: null,
        liveMode: false,
        transportStatus: "disabled",
      }),
    ).toBe("idle");
  });
});
