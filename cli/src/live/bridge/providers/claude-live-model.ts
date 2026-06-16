import { DEFAULT_CLAUDE_LIVE_PROFILE_ID } from "../../../../../shared/live-agent-profile.js";

export function resolveClaudeLiveModel(profileId: string): string {
  switch (profileId) {
    case "fast":
      return "haiku";
    case DEFAULT_CLAUDE_LIVE_PROFILE_ID:
      return "sonnet";
    case "thorough":
      return "opus";
    default:
      throw new Error(`Unknown Claude live profile "${profileId}".`);
  }
}

export function resolveClaudeLiveModelIfConfigured(
  profileId: string | undefined,
): string | undefined {
  return profileId ? resolveClaudeLiveModel(profileId) : undefined;
}
