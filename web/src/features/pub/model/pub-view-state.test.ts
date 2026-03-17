import { describe, expect, it } from "vitest";
import type { LiveControlBarState } from "~/features/live/types/live-types";
import {
  derivePubViewState,
  isControlBarCollapsible,
  resolveTransportStatus,
} from "./pub-view-state";

const NOW = 1_700_000_000_000;

describe("resolveTransportStatus", () => {
  it("disables transport for viewers", () => {
    expect(
      resolveTransportStatus({
        agentOnline: true,
        connectionState: "connected",
        liveMode: false,
        sessionState: "active",
      }),
    ).toBe("disabled");
  });

  it("disables transport while takeover state owns the live session", () => {
    expect(
      resolveTransportStatus({
        agentOnline: true,
        connectionState: "connected",
        liveMode: true,
        sessionState: "needs-takeover",
      }),
    ).toBe("disabled");
  });

  it("maps bridge state to live transport state for active owner sessions", () => {
    expect(
      resolveTransportStatus({
        agentOnline: true,
        connectionState: "connecting",
        liveMode: true,
        sessionState: "active",
      }),
    ).toBe("connecting");

    expect(
      resolveTransportStatus({
        agentOnline: true,
        connectionState: "failed",
        liveMode: true,
        sessionState: "active",
      }),
    ).toBe("disconnected");
  });

  it("treats disconnected connection state as disconnected", () => {
    expect(
      resolveTransportStatus({
        agentOnline: true,
        connectionState: "disconnected",
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
        connectionState: "connecting",
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
        connectionState: "failed",
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

  it("derives disconnected control state when connection is disconnected", () => {
    expect(
      derivePubViewState({
        agentOnline: true,
        audioMode: "idle",
        connectionState: "disconnected",
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
      connectionState: "connected",
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

  it("surfaces command errors through the error summary", () => {
    const state = derivePubViewState({
      agentOnline: true,
      audioMode: "idle",
      connectionState: "connected",
      command: {
        activeCallId: null,
        activeCommandName: "render",
        activeCount: 0,
        errorMessage: "Command execution timed out",
        finishedAt: NOW,
        phase: "failed",
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
      message: "Command execution timed out",
      source: "command",
    });
    expect(state.visualState).toBe("error");
  });

  it("surfaces session errors through the error summary", () => {
    const state = derivePubViewState({
      agentOnline: true,
      audioMode: "idle",
      connectionState: "connected",
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
      sessionError: "Agent went offline",
      sessionState: "active",
    });

    expect(state.error).toEqual({
      message: "Agent went offline",
      source: "session",
    });
    expect(state.visualState).toBe("error");
  });
});

describe("isControlBarCollapsible", () => {
  const COLLAPSIBLE: LiveControlBarState[] = ["idle", "connecting"];

  const NON_COLLAPSIBLE: LiveControlBarState[] = [
    "agent-selection",
    "offline",
    "needs-takeover",
    "taken-over",
    "disconnected",
    "starting-recording",
    "recording",
    "recording-paused",
    "stopping-recording",
    "starting-voice",
    "voice-mode",
    "stopping-voice",
  ];

  for (const state of COLLAPSIBLE) {
    it(`allows collapse for "${state}"`, () => {
      expect(isControlBarCollapsible(state)).toBe(true);
    });
  }

  for (const state of NON_COLLAPSIBLE) {
    it(`prevents collapse for "${state}"`, () => {
      expect(isControlBarCollapsible(state)).toBe(false);
    });
  }

  it("covers every LiveControlBarState value", () => {
    const allStates = [...COLLAPSIBLE, ...NON_COLLAPSIBLE];
    const uniqueStates = new Set(allStates);
    expect(uniqueStates.size).toBe(allStates.length);
  });
});
