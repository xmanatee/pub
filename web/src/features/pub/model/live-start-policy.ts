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
  selectedHostId: string | null;
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
    source.hasCommandManifest && source.selectedHostId === null && source.availableAgentCount !== 1;
  const canStartOnCanvas =
    source.hasCommandManifest && (autoStartAvailable || source.selectedHostId !== null);

  return {
    autoStartAvailable,
    defaultCollapsed: source.hasCanvasContent && (!source.hasCommandManifest || canStartOnCanvas),
    optionalLive,
    requiresUserAction,
  };
}
