export const LIVE_MODEL_PROFILES = ["fast", "balanced", "thorough"] as const;

export type LiveModelProfile = (typeof LIVE_MODEL_PROFILES)[number];

export const DEFAULT_LIVE_MODEL_PROFILE: LiveModelProfile = "balanced";

export function readLiveModelProfile(input: unknown): LiveModelProfile | undefined {
  if (input === "fast" || input === "balanced" || input === "thorough") {
    return input;
  }
  return undefined;
}

export function resolveLiveModelProfile(
  profile: LiveModelProfile | null | undefined,
): LiveModelProfile {
  return profile ?? DEFAULT_LIVE_MODEL_PROFILE;
}
