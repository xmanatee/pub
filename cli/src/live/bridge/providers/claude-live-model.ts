import type { LiveModelProfile } from "../../../../../shared/live-model-profile.js";

export function resolveClaudeLiveModel(profile: LiveModelProfile): string {
  switch (profile) {
    case "fast":
      return "haiku";
    case "thorough":
      return "opus";
    default:
      return "sonnet";
  }
}
