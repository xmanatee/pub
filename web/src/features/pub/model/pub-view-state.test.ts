import { describe, expect, it } from "vitest";
import { derivePubViewState, resolveTransportStatus } from "./pub-view-state";

const NOW = 1_700_000_000_000;

describe("resolveTransportStatus", () => {
  it("disables transport for viewers", () => {
    expect(
      resolveTransportStatus({
        agentOnline: true,
        bridgeState: "connected",
        liveMode: false,
        sessionState: "active",
      }),
    ).toBe("disabled");
  });

  it("disables transport while takeover state owns the live session", () => {
    expect(
      resolveTransportStatus({
        agentOnline: true,
        bridgeState: "connected",
        liveMode: true,
        sessionState: "needs-takeover",
      }),
    ).toBe("disabled");
  });

  it("maps bridge state to live transport state for active owner sessions", () => {
    expect(
      resolveTransportStatus({
        agentOnline: true,
        bridgeState: "connecting",
        liveMode: true,
        sessionState: "active",
      }),
    ).toBe("connecting");

    expect(
      resolveTransportStatus({
        agentOnline: true,
        bridgeState: "failed",
        liveMode: true,
        sessionState: "active",
      }),
    ).toBe("disconnected");
  });

  it("treats recoverable ICE disconnect as connecting", () => {
    expect(
      resolveTransportStatus({
        agentOnline: true,
        bridgeState: "disconnected",
        liveMode: true,
        sessionState: "active",
      }),
    ).toBe("connecting");
  });
});

describe("derivePubViewState", () => {
  it("derives disconnected control state for terminal bridge failure", () => {
    expect(
      derivePubViewState({
        agentOnline: true,
        audioMode: "idle",
        bridgeState: "failed",
        canvasError: null,
        command: {
          activeCallId: null,
          activeCommandName: null,
          activeCount: 0,
          errorMessage: null,
          finishedAt: null,
          phase: "idle",
        },
        contentState: "ready",
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        needsAgentSelection: false,
        now: NOW,
        sessionError: null,
        sessionState: "active",
      }).controlBarState,
    ).toBe("disconnected");
  });

  it("derives connecting control state for recoverable ICE disconnect", () => {
    expect(
      derivePubViewState({
        agentOnline: true,
        audioMode: "idle",
        bridgeState: "disconnected",
        canvasError: null,
        command: {
          activeCallId: null,
          activeCommandName: null,
          activeCount: 0,
          errorMessage: null,
          finishedAt: null,
          phase: "idle",
        },
        contentState: "ready",
        lastAgentOutput: null,
        lastUserDeliveredAt: null,
        liveMode: true,
        needsAgentSelection: false,
        now: NOW,
        sessionError: null,
        sessionState: "active",
      }).controlBarState,
    ).toBe("connecting");
  });

  it("keeps command execution orthogonal to idle control-bar mode", () => {
    const state = derivePubViewState({
      agentOnline: true,
      audioMode: "idle",
      bridgeState: "connected",
      canvasError: null,
      command: {
        activeCallId: "cmd-1",
        activeCommandName: "render",
        activeCount: 1,
        errorMessage: null,
        finishedAt: null,
        phase: "running",
      },
      contentState: "ready",
      lastAgentOutput: null,
      lastUserDeliveredAt: null,
      liveMode: true,
      needsAgentSelection: false,
      now: NOW,
      sessionError: null,
      sessionState: "active",
    });

    expect(state.controlBarState).toBe("idle");
    expect(state.visualState).toBe("command-running");
  });

  it("surfaces canvas errors through the shared error domain", () => {
    const state = derivePubViewState({
      agentOnline: true,
      audioMode: "idle",
      bridgeState: "connected",
      canvasError: "ReferenceError",
      command: {
        activeCallId: null,
        activeCommandName: null,
        activeCount: 0,
        errorMessage: null,
        finishedAt: null,
        phase: "idle",
      },
      contentState: "ready",
      lastAgentOutput: null,
      lastUserDeliveredAt: null,
      liveMode: true,
      needsAgentSelection: false,
      now: NOW,
      sessionError: null,
      sessionState: "active",
    });

    expect(state.error).toEqual({
      message: "ReferenceError",
      source: "canvas",
    });
    expect(state.visualState).toBe("error");
  });
});
