import { describe, expect, it } from "vitest";
import {
  canSendAgentTraffic,
  canSendCanvasFileTraffic,
  canSendCommandTraffic,
  IDLE_LIVE_RUNTIME_STATE,
  isLiveAgentActivity,
  isLiveAgentState,
  isLiveConnectionReady,
  isLiveConnectionState,
  isLiveExecutorState,
} from "./live-runtime-state-core";

describe("isLiveAgentActivity", () => {
  it("accepts valid activity values", () => {
    expect(isLiveAgentActivity("idle")).toBe(true);
    expect(isLiveAgentActivity("thinking")).toBe(true);
    expect(isLiveAgentActivity("streaming")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isLiveAgentActivity(null)).toBe(false);
    expect(isLiveAgentActivity("working")).toBe(false);
    expect(isLiveAgentActivity("")).toBe(false);
  });
});

describe("isLiveConnectionState", () => {
  it("accepts valid connection states", () => {
    expect(isLiveConnectionState("idle")).toBe(true);
    expect(isLiveConnectionState("connected")).toBe(true);
    expect(isLiveConnectionState("failed")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isLiveConnectionState(null)).toBe(false);
    expect(isLiveConnectionState("open")).toBe(false);
  });
});

describe("isLiveAgentState", () => {
  it("accepts valid agent states", () => {
    expect(isLiveAgentState("idle")).toBe(true);
    expect(isLiveAgentState("preparing")).toBe(true);
    expect(isLiveAgentState("ready")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isLiveAgentState("thinking")).toBe(false);
    expect(isLiveAgentState("streaming")).toBe(false);
  });
});

describe("isLiveExecutorState", () => {
  it("accepts valid executor states", () => {
    expect(isLiveExecutorState("idle")).toBe(true);
    expect(isLiveExecutorState("loading")).toBe(true);
    expect(isLiveExecutorState("ready")).toBe(true);
  });
});

describe("IDLE_LIVE_RUNTIME_STATE", () => {
  it("includes agentActivity field", () => {
    expect(IDLE_LIVE_RUNTIME_STATE).toEqual({
      agentActivity: "idle",
      agentState: "idle",
      connectionState: "idle",
      executorState: "idle",
    });
  });
});

describe("traffic guards", () => {
  it("requires agentActivity in snapshot shape", () => {
    const snapshot = {
      ...IDLE_LIVE_RUNTIME_STATE,
      agentState: "ready" as const,
      connectionState: "connected" as const,
    };
    expect(canSendAgentTraffic(snapshot)).toBe(true);
    expect(snapshot.agentActivity).toBe("idle");
  });

  it("isLiveConnectionReady accepts snapshot or string", () => {
    expect(isLiveConnectionReady("connected")).toBe(true);
    expect(isLiveConnectionReady("connecting")).toBe(false);
    expect(
      isLiveConnectionReady({ ...IDLE_LIVE_RUNTIME_STATE, connectionState: "connected" }),
    ).toBe(true);
  });

  it("canSendCommandTraffic requires executor ready", () => {
    expect(
      canSendCommandTraffic({
        ...IDLE_LIVE_RUNTIME_STATE,
        connectionState: "connected",
        executorState: "ready",
      }),
    ).toBe(true);
    expect(
      canSendCommandTraffic({
        ...IDLE_LIVE_RUNTIME_STATE,
        connectionState: "connected",
        executorState: "loading",
      }),
    ).toBe(false);
  });

  it("canSendCanvasFileTraffic only requires connection", () => {
    expect(
      canSendCanvasFileTraffic({ ...IDLE_LIVE_RUNTIME_STATE, connectionState: "connected" }),
    ).toBe(true);
    expect(canSendCanvasFileTraffic(IDLE_LIVE_RUNTIME_STATE)).toBe(false);
  });
});
