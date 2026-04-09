import type { LiveModelProfile } from "../../../../shared/live-model-profile.js";
import type { BridgeMode } from "../../live/bridge/providers/types.js";

export { DEFAULT_COMMAND_TIMEOUT_MS } from "../../../../shared/command-protocol-core.js";

export const DEFAULT_BASE_URL = "https://silent-guanaco-514.convex.site";
export const DEFAULT_RELAY_URL = "https://pub-relay.mishaplots.workers.dev";
export const DEFAULT_COMMAND_MAX_OUTPUT_BYTES = 256 * 1024;
export const DEFAULT_COMMAND_MAX_CONCURRENT = 6;
export const DEFAULT_COMMAND_AGENT_PROFILE = "default";

export type CommandAgentProfile = "fast" | "default" | "deep";
export type DetachedAgentProvider = "claude-code" | "claude-sdk" | "openclaw";

export type PubCoreConfig = {
  apiKey?: string;
  baseUrl?: string;
  telemetry?: boolean;
  sentryDsn?: string;
};

export type PubBridgeConfig = {
  mode?: BridgeMode;
  openclawPath?: string;
  openclawStateDir?: string;
  sessionId?: string;
  verbose?: boolean;
  claudeCodePath?: string;
  claudeCodeMaxTurns?: number;
  commandDefaultTimeoutMs?: number;
  commandMaxOutputBytes?: number;
  commandMaxConcurrent?: number;
  commandAgentDefaultProfile?: CommandAgentProfile;
  commandAgentDetachedProvider?: DetachedAgentProvider;
  claudeCodeCommandModelDefault?: string;
  claudeCodeCommandModelFast?: string;
  claudeCodeCommandModelDeep?: string;
  claudeSdkCommandModelDefault?: string;
  claudeSdkCommandModelFast?: string;
  claudeSdkCommandModelDeep?: string;
  openclawLikeCommand?: string;
  channelSocketPath?: string;
};

export type PubTelegramConfig = {
  botToken?: string;
  botUsername?: string;
  hasMainWebApp?: boolean;
};

export type PubTunnelConfig = {
  devCommand?: string;
  devPort?: number;
  relayUrl?: string;
};

export type PubConfig = {
  core?: PubCoreConfig;
  bridge?: PubBridgeConfig;
  telegram?: PubTelegramConfig;
  tunnel?: PubTunnelConfig;
};

interface BridgeSettingsBase {
  mode: BridgeMode;
  verbose: boolean;
  workspaceDir: string;
  attachmentDir: string;
  artifactsDir: string;
  commandDefaultTimeoutMs: number;
  commandMaxOutputBytes: number;
  commandMaxConcurrent: number;
  commandAgentDefaultProfile: CommandAgentProfile;
  commandAgentDetachedProvider?: DetachedAgentProvider;
  openclawPath?: string;
  openclawStateDir?: string;
  sessionId?: string;
  claudeCodePath?: string;
  claudeCodeMaxTurns?: number;
  claudeCodeCommandModelDefault?: string;
  claudeCodeCommandModelFast?: string;
  claudeCodeCommandModelDeep?: string;
  claudeSdkCommandModelDefault?: string;
  claudeSdkCommandModelFast?: string;
  claudeSdkCommandModelDeep?: string;
  openclawLikeCommand?: string;
  channelSocketPath?: string;
  liveModelProfile?: LiveModelProfile;
}

export type OpenClawBridgeSettings = BridgeSettingsBase & {
  mode: "openclaw";
  openclawPath: string;
  sessionId: string;
};

export type ClaudeBridgeSettings = BridgeSettingsBase & {
  mode: "claude-code" | "claude-sdk";
  claudeCodePath: string;
};

export type ClaudeChannelBridgeSettings = BridgeSettingsBase & {
  mode: "claude-channel";
};

export type OpenClawLikeBridgeSettings = BridgeSettingsBase & {
  mode: "openclaw-like";
  openclawLikeCommand: string;
};

export type BridgeSettings =
  | OpenClawBridgeSettings
  | ClaudeBridgeSettings
  | ClaudeChannelBridgeSettings
  | OpenClawLikeBridgeSettings;

export type ApiClientSettings = {
  apiKey: string;
  baseUrl: string;
};

export type SettingSource = "env" | "config" | "default";

export type ResolvedValue<T> = {
  value: T;
  source: SettingSource;
  envKey?: string;
};

export type ResolvedPubSettings = {
  rawConfig: PubConfig;
  core: {
    apiKey: ResolvedValue<string> | null;
    baseUrl: ResolvedValue<string>;
  };
  valuesByKey: Record<string, ResolvedValue<unknown> | null>;
};

export type ConfigDirSource = "PUB_CONFIG_HOME";

export type ConfigLocation = {
  dir: string;
  path: string;
  source: ConfigDirSource;
  description: string;
};
