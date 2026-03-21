import type { LiveContentState } from "~/features/live/types/live-types";

export interface DefaultLiveRequestedSource {
  contentState: LiveContentState;
  hasCommandManifest: boolean;
}

export interface LiveStartPolicySource {
  availableAgentCount: number;
  hasCanvasContent: boolean;
  hasCommandManifest: boolean;
  liveRequested: boolean;
  selectedPresenceId: string | null;
}

export interface LiveStartPolicy {
  autoStartAvailable: boolean;
  defaultCollapsed: boolean;
  optionalLive: boolean;
  requiresUserAction: boolean;
}

export function deriveDefaultLiveRequested(source: DefaultLiveRequestedSource): boolean {
  return source.hasCommandManifest || source.contentState === "empty";
}

export function deriveLiveStartPolicy(source: LiveStartPolicySource): LiveStartPolicy {
  const autoStartAvailable = source.hasCommandManifest && source.availableAgentCount === 1;
  const optionalLive = !source.hasCommandManifest && !source.liveRequested;
  const requiresUserAction =
    source.hasCommandManifest &&
    source.selectedPresenceId === null &&
    source.availableAgentCount !== 1;

  return {
    autoStartAvailable,
    defaultCollapsed: source.hasCanvasContent && (!source.hasCommandManifest || autoStartAvailable),
    optionalLive,
    requiresUserAction,
  };
}
