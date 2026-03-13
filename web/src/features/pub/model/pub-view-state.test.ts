import { describe, expect, it } from "vitest";
import { derivePubViewState, resolveTransportStatus } from "./pub-view-state";

const NOW = 1_700_000_000_000;

describe("resolveTransportStatus", () => {
  it("disables transport for viewers", () => {
    expect(
      resolveTransportStatus({
        agentOnline: true,
        bridgeState: "connected",
        liveReady: true,
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
        liveReady: false,
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
        liveReady: false,
        liveMode: true,
        sessionState: "active",
      }),
    ).toBe("connecting");

    expect(
      resolveTransportStatus({
        agentOnline: true,
        bridgeState: "failed",
        liveReady: false,
        liveMode: true,
        sessionState: "active",
      }),
    ).toBe("disconnected");
  });

  it("treats ICE disconnect without app-ready handshake as disconnected", () => {
    expect(
      resolveTransportStatus({
        agentOnline: true,
        bridgeState: "disconnected",
        liveReady: false,
        liveMode: true,
        sessionState: "active",
      }),
    ).toBe("disconnected");
  });
});

describe("derivePubViewState", () => {
  it("derives agent-selection control state when multiple agents and none selected", () => {
    expect(
      derivePubViewState({
        agentOnline: true,
        audioMode: "idle",
        bridgeState: "connecting",
        liveReady: false,
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
        needsAgentSelection: true,
        now: NOW,
        sessionError: null,
        sessionState: "active",
      }).controlBarState,
    ).toBe("agent-selection");
  });

  it("derives disconnected control state for terminal bridge failure", () => {
    expect(
      derivePubViewState({
        agentOnline: true,
        audioMode: "idle",
        bridgeState: "failed",
        liveReady: false,
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

  it("derives disconnected control state until app-ready handshake completes", () => {
    expect(
      derivePubViewState({
        agentOnline: true,
        audioMode: "idle",
        bridgeState: "disconnected",
        liveReady: false,
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

  it("keeps command execution orthogonal to idle control-bar mode", () => {
    const state = derivePubViewState({
      agentOnline: true,
      audioMode: "idle",
      bridgeState: "connected",
      liveReady: true,
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
      liveReady: true,
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
