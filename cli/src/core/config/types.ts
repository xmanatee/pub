import type { BridgeMode } from "../../live/daemon/shared.js";

export const DEFAULT_BASE_URL = "https://silent-guanaco-514.convex.site";
export const DEFAULT_CANVAS_REMINDER_EVERY = 10;
export const DEFAULT_BRIDGE_DELIVER_TIMEOUT_MS = 120_000;
export const DEFAULT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;
export const DEFAULT_COMMAND_MAX_OUTPUT_BYTES = 256 * 1024;
export const DEFAULT_COMMAND_MAX_CONCURRENT = 6;

export interface BridgeConfig {
  mode?: BridgeMode;
  openclawPath?: string;
  openclawStateDir?: string;
  sessionId?: string;
  threadId?: string;
  bridgeCwd?: string;
  canvasReminderEvery?: number;
  deliver?: boolean;
  deliverChannel?: string;
  deliverTimeoutMs?: number;
  attachmentDir?: string;
  attachmentMaxBytes?: number;
  claudeCodePath?: string;
  claudeCodeModel?: string;
  claudeCodeAllowedTools?: string;
  claudeCodeAppendSystemPrompt?: string;
  claudeCodeMaxTurns?: number;
  commandDefaultTimeoutMs?: number;
  commandMaxOutputBytes?: number;
  commandMaxConcurrent?: number;
}

interface PreparedBridgeConfigBase {
  mode: BridgeMode;
  bridgeCwd: string;
  canvasReminderEvery: number;
  deliver: boolean;
  deliverTimeoutMs: number;
  attachmentDir: string;
  attachmentMaxBytes: number;
  commandDefaultTimeoutMs: number;
  commandMaxOutputBytes: number;
  commandMaxConcurrent: number;
  openclawStateDir?: string;
  threadId?: string;
  deliverChannel?: string;
  claudeCodeModel?: string;
  claudeCodeAllowedTools?: string;
  claudeCodeAppendSystemPrompt?: string;
  claudeCodeMaxTurns?: number;
}

export interface PreparedOpenClawConfig extends PreparedBridgeConfigBase {
  mode: "openclaw";
  openclawPath: string;
  sessionId: string;
}

export interface PreparedClaudeBridgeConfig extends PreparedBridgeConfigBase {
  mode: "claude-code" | "claude-sdk";
  claudeCodePath: string;
}

export type PreparedBridgeConfig = PreparedOpenClawConfig | PreparedClaudeBridgeConfig;

export interface TelegramConfig {
  botToken?: string;
  botUsername?: string;
  hasMainWebApp?: boolean;
}

export interface SavedConfig {
  apiKey?: string;
  bridge?: BridgeConfig;
  telegram?: TelegramConfig;
}

export interface RequiredConfig {
  apiKey: string;
  baseUrl: string;
  bridge?: BridgeConfig;
}

export type ConfigValueSource = "env" | "config" | "default";

export interface ConfigField<T> {
  value: T;
  source: ConfigValueSource;
  envKey?: string;
}

export interface ResolvedConfig {
  apiKey: ConfigField<string> | null;
  baseUrl: ConfigField<string>;
  bridge: BridgeConfig;
  telegram: TelegramConfig;
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
