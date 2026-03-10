import type { BridgeMode } from "../../live/daemon/shared.js";

export const DEFAULT_BASE_URL = "https://silent-guanaco-514.convex.site";
export const DEFAULT_CANVAS_REMINDER_EVERY = 10;
export const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
export const DEFAULT_COMMAND_MAX_OUTPUT_BYTES = 256 * 1024;
export const DEFAULT_COMMAND_MAX_CONCURRENT = 6;

export interface PubCoreConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface PubBridgeConfig {
  mode?: BridgeMode;
  openclawPath?: string;
  openclawStateDir?: string;
  sessionId?: string;
  threadId?: string;
  verbose?: boolean;
  bridgeCwd?: string;
  canvasReminderEvery?: number;
  attachmentDir?: string;
  claudeCodePath?: string;
  claudeCodeMaxTurns?: number;
  commandDefaultTimeoutMs?: number;
  commandMaxOutputBytes?: number;
  commandMaxConcurrent?: number;
  openclawLikeCommand?: string;
}

export interface PubTelegramConfig {
  botToken?: string;
  botUsername?: string;
  hasMainWebApp?: boolean;
}

export interface PubConfig {
  core?: PubCoreConfig;
  bridge?: PubBridgeConfig;
  telegram?: PubTelegramConfig;
}

interface BridgeSettingsBase {
  mode: BridgeMode;
  verbose: boolean;
  bridgeCwd: string;
  canvasReminderEvery: number;
  attachmentDir: string;
  commandDefaultTimeoutMs: number;
  commandMaxOutputBytes: number;
  commandMaxConcurrent: number;
  openclawPath?: string;
  openclawStateDir?: string;
  sessionId?: string;
  threadId?: string;
  claudeCodePath?: string;
  claudeCodeMaxTurns?: number;
  openclawLikeCommand?: string;
}

export interface OpenClawBridgeSettings extends BridgeSettingsBase {
  mode: "openclaw";
  openclawPath: string;
  sessionId: string;
}

export interface ClaudeBridgeSettings extends BridgeSettingsBase {
  mode: "claude-code" | "claude-sdk";
  claudeCodePath: string;
}

export interface OpenClawLikeBridgeSettings extends BridgeSettingsBase {
  mode: "openclaw-like";
  openclawLikeCommand: string;
}

export type BridgeSettings =
  | OpenClawBridgeSettings
  | ClaudeBridgeSettings
  | OpenClawLikeBridgeSettings;

export interface ApiClientSettings {
  apiKey: string;
  baseUrl: string;
}

export type SettingSource = "env" | "config" | "default";

export interface ResolvedValue<T> {
  value: T;
  source: SettingSource;
  envKey?: string;
}

export interface ResolvedPubSettings {
  rawConfig: PubConfig;
  core: {
    apiKey: ResolvedValue<string> | null;
    baseUrl: ResolvedValue<string>;
  };
  valuesByKey: Record<string, ResolvedValue<unknown> | null>;
}

export type ConfigDirSource = "PUB_CONFIG_DIR" | "OPENCLAW_HOME" | "HOME_CONFIG";

export interface ConfigDirCandidate {
  dir: string;
  exists: boolean;
  source: ConfigDirSource;
  description: string;
}

export interface ConfigLocation {
  dir: string;
  path: string;
  source: ConfigDirSource;
  description: string;
}
