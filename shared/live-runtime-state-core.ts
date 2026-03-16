export type LiveConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "failed";

export type LiveAgentState = "idle" | "preparing" | "ready";

export type LiveExecutorState = "idle" | "loading" | "ready";

const LIVE_CONNECTION_STATES = new Set<LiveConnectionState>([
  "idle",
  "connecting",
  "connected",
  "disconnected",
  "failed",
]);

const LIVE_AGENT_STATES = new Set<LiveAgentState>(["idle", "preparing", "ready"]);

const LIVE_EXECUTOR_STATES = new Set<LiveExecutorState>(["idle", "loading", "ready"]);

export interface LiveRuntimeStateSnapshot {
  connectionState: LiveConnectionState;
  agentState: LiveAgentState;
  executorState: LiveExecutorState;
}

export const IDLE_LIVE_RUNTIME_STATE: LiveRuntimeStateSnapshot = {
  connectionState: "idle",
  agentState: "idle",
  executorState: "idle",
};

export function isLiveConnectionState(value: string | null): value is LiveConnectionState {
  return value != null && LIVE_CONNECTION_STATES.has(value as LiveConnectionState);
}

export function isLiveAgentState(value: string | null): value is LiveAgentState {
  return value != null && LIVE_AGENT_STATES.has(value as LiveAgentState);
}

export function isLiveExecutorState(value: string | null): value is LiveExecutorState {
  return value != null && LIVE_EXECUTOR_STATES.has(value as LiveExecutorState);
}

export function isLiveConnectionReady(
  input: LiveConnectionState | LiveRuntimeStateSnapshot,
): boolean {
  return (typeof input === "string" ? input : input.connectionState) === "connected";
}

export function canSendAgentTraffic(snapshot: LiveRuntimeStateSnapshot): boolean {
  return isLiveConnectionReady(snapshot) && snapshot.agentState === "ready";
}

export function canSendCommandTraffic(snapshot: LiveRuntimeStateSnapshot): boolean {
  return isLiveConnectionReady(snapshot) && snapshot.executorState === "ready";
}

export function canSendCanvasFileTraffic(snapshot: LiveRuntimeStateSnapshot): boolean {
  return isLiveConnectionReady(snapshot);
}
