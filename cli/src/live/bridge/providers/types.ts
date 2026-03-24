export const BRIDGE_MODES = [
  "openclaw",
  "claude-code",
  "claude-sdk",
  "claude-channel",
  "openclaw-like",
] as const;

export type BridgeMode = (typeof BRIDGE_MODES)[number];
