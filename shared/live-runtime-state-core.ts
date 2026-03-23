export type LiveConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "failed";

export type LiveAgentState = "idle" | "preparing" | "ready";

export type LiveAgentActivity = "idle" | "thinking" | "streaming";

export type LiveExecutorState = "idle" | "loading" | "ready";

const LIVE_CONNECTION_STATES = new Set<LiveConnectionState>([
  "idle",
  "connecting",
  "connected",
  "disconnected",
  "failed",
]);

const LIVE_AGENT_STATES = new Set<LiveAgentState>(["idle", "preparing", "ready"]);

const LIVE_AGENT_ACTIVITIES = new Set<LiveAgentActivity>(["idle", "thinking", "streaming"]);

const LIVE_EXECUTOR_STATES = new Set<LiveExecutorState>(["idle", "loading", "ready"]);

export type LiveRuntimeStateSnapshot = {
  agentActivity: LiveAgentActivity;
  agentState: LiveAgentState;
  connectionState: LiveConnectionState;
  executorState: LiveExecutorState;
};

export const IDLE_LIVE_RUNTIME_STATE: LiveRuntimeStateSnapshot = {
  agentActivity: "idle",
  agentState: "idle",
  connectionState: "idle",
  executorState: "idle",
};

export function isLiveConnectionState(value: string | null): value is LiveConnectionState {
  return value != null && LIVE_CONNECTION_STATES.has(value as LiveConnectionState);
}

export function isLiveAgentState(value: string | null): value is LiveAgentState {
  return value != null && LIVE_AGENT_STATES.has(value as LiveAgentState);
}

export function isLiveAgentActivity(value: string | null): value is LiveAgentActivity {
  return value != null && LIVE_AGENT_ACTIVITIES.has(value as LiveAgentActivity);
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
