import {
  CLAUDE_LIVE_AGENT_PROFILES,
  type LiveAgentProfileOption,
} from "../../../../../shared/live-agent-profile.js";
import type { BridgeSettings } from "../../../core/config/index.js";

export function getLiveAgentProfileOptions(
  bridgeSettings: BridgeSettings,
): LiveAgentProfileOption[] {
  if (bridgeSettings.mode === "claude-code" || bridgeSettings.mode === "claude-sdk") {
    return CLAUDE_LIVE_AGENT_PROFILES;
  }

  if (bridgeSettings.mode === "openclaw-like") {
    return Object.entries(bridgeSettings.openclawLikeProfiles).map(([id, profile]) => ({
      id,
      label: profile.label,
      description: profile.description,
    }));
  }

  return [];
}
