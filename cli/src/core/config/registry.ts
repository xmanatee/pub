import type { BridgeMode } from "../../live/bridge/providers/types.js";
import { parsePositiveInteger } from "../utils/number.js";
import { trimToUndefined } from "./location.js";
import {
  DEFAULT_BASE_URL,
  type PubBridgeConfig,
  type PubConfig,
  type PubTelegramConfig,
} from "./types.js";

export type ConfigSection = "core" | "bridge" | "telegram";
export type ConfigValueType = "string" | "boolean" | "integer" | "bridge-mode";
export type ConfigDisplayMode = "value" | "set-only";

export interface ConfigVarDefinition {
  key: string;
  section: ConfigSection;
  field: string;
  description: string;
  type: ConfigValueType;
  env?: readonly string[];
  defaultValue?: string | number | boolean;
  secret?: boolean;
  mutable?: boolean;
  displayAs?: ConfigDisplayMode;
  cascadeUnset?: readonly string[];
}

export function declareConfigVar(definition: ConfigVarDefinition): ConfigVarDefinition {
  return definition;
}

function bridgeVar(
  key: string,
  field: keyof PubBridgeConfig,
  type: ConfigValueType,
  definition: Omit<ConfigVarDefinition, "key" | "section" | "field" | "type">,
): ConfigVarDefinition {
  return declareConfigVar({ key, section: "bridge", field, type, ...definition });
}

function telegramVar(
  key: string,
  field: keyof PubTelegramConfig,
  type: ConfigValueType,
  definition: Omit<ConfigVarDefinition, "key" | "section" | "field" | "type">,
): ConfigVarDefinition {
  return declareConfigVar({ key, section: "telegram", field, type, ...definition });
}

const CONFIG_VARS: ConfigVarDefinition[] = [
  declareConfigVar({
    key: "apiKey",
    section: "core",
    field: "apiKey",
    type: "string",
    description: "Pub API key used for authenticated CLI requests.",
    env: ["PUB_API_KEY"],
    secret: true,
  }),
  declareConfigVar({
    key: "baseUrl",
    section: "core",
    field: "baseUrl",
    type: "string",
    description: "Pub API base URL.",
    env: ["PUB_BASE_URL"],
    defaultValue: DEFAULT_BASE_URL,
  }),
  bridgeVar("bridge.mode", "mode", "bridge-mode", {
    description: "Selected live bridge runtime.",
  }),
  bridgeVar("bridge.verbose", "verbose", "boolean", {
    description: "Enable verbose live daemon logging.",
  }),
  bridgeVar("bridge.cwd", "bridgeCwd", "string", {
    description: "Working directory used by the live bridge runtime.",
  }),
  bridgeVar("bridge.canvasReminderEvery", "canvasReminderEvery", "integer", {
    description: "Interval for canvas policy reminders.",
  }),
  bridgeVar("bridge.attachmentDir", "attachmentDir", "string", {
    description: "Attachment staging directory for live bridge payloads.",
  }),
  bridgeVar("openclaw.path", "openclawPath", "string", {
    description: "OpenClaw executable path.",
    env: ["OPENCLAW_PATH"],
  }),
  bridgeVar("openclaw.stateDir", "openclawStateDir", "string", {
    description: "OpenClaw state directory.",
    env: ["OPENCLAW_STATE_DIR"],
  }),
  bridgeVar("openclaw.sessionId", "sessionId", "string", {
    description: "OpenClaw session id used for live replies.",
    env: ["OPENCLAW_SESSION_ID"],
  }),
  bridgeVar("openclaw.threadId", "threadId", "string", {
    description: "OpenClaw thread id used for session lookup.",
    env: ["OPENCLAW_THREAD_ID"],
  }),
  bridgeVar("claude-code.path", "claudeCodePath", "string", {
    description: "Claude executable path.",
    env: ["CLAUDE_CODE_PATH"],
  }),
  bridgeVar("claude-code.maxTurns", "claudeCodeMaxTurns", "integer", {
    description: "Claude max turns override.",
    env: ["CLAUDE_CODE_MAX_TURNS"],
  }),
  bridgeVar("openclawLike.command", "openclawLikeCommand", "string", {
    description: "Command path for openclaw-like bridge delivery.",
    env: ["PUB_OPENCLAW_LIKE_COMMAND"],
  }),
  bridgeVar("command.defaultTimeoutMs", "commandDefaultTimeoutMs", "integer", {
    description: "Default timeout for canvas command execution.",
  }),
  bridgeVar("command.maxOutputBytes", "commandMaxOutputBytes", "integer", {
    description: "Maximum command stdout/stderr bytes.",
  }),
  bridgeVar("command.maxConcurrent", "commandMaxConcurrent", "integer", {
    description: "Maximum concurrent canvas commands.",
  }),
  telegramVar("telegram.botToken", "botToken", "string", {
    description: "Telegram bot token used for Mini App deep links.",
    secret: true,
    cascadeUnset: ["telegram.botUsername", "telegram.hasMainWebApp"],
  }),
  telegramVar("telegram.botUsername", "botUsername", "string", {
    description: "Derived Telegram bot username.",
    mutable: false,
  }),
  telegramVar("telegram.hasMainWebApp", "hasMainWebApp", "boolean", {
    description: "Derived Telegram Mini App capability flag.",
    mutable: false,
  }),
];

export const CONFIG_VAR_REGISTRY: Record<string, ConfigVarDefinition> = Object.fromEntries(
  CONFIG_VARS.map((definition) => [definition.key, definition]),
);

export const SUPPORTED_CONFIG_KEYS = CONFIG_VARS.filter(
  (definition) => definition.mutable !== false,
).map((definition) => definition.key);

function parseBooleanValue(raw: string, key: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on")
    return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off")
    return false;
  throw new Error(`Invalid boolean value for ${key}: ${raw}`);
}

function parseBridgeModeValue(raw: string, key: string): BridgeMode {
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === "openclaw" ||
    normalized === "claude-code" ||
    normalized === "claude-sdk" ||
    normalized === "openclaw-like"
  ) {
    return normalized;
  }
  throw new Error(`Invalid bridge mode for ${key}: ${raw}`);
}

export function getConfigVars(): ConfigVarDefinition[] {
  return [...CONFIG_VARS];
}

export function getConfigVar(key: string): ConfigVarDefinition | null {
  return CONFIG_VAR_REGISTRY[key] ?? null;
}

export function getConfigVarsBySection(section: ConfigSection): ConfigVarDefinition[] {
  return CONFIG_VARS.filter((definition) => definition.section === section);
}

export function isMutableConfigVar(definition: ConfigVarDefinition): boolean {
  return definition.mutable !== false;
}

export function coerceConfigVarInput(
  definition: ConfigVarDefinition,
  raw: string,
): string | number | boolean | BridgeMode {
  if (definition.type === "integer") return parsePositiveInteger(raw, definition.key);
  if (definition.type === "boolean") return parseBooleanValue(raw, definition.key);
  if (definition.type === "bridge-mode") return parseBridgeModeValue(raw, definition.key);
  return raw.trim();
}

export function readEnvOverride(
  definition: ConfigVarDefinition,
  env: NodeJS.ProcessEnv = process.env,
): { key: string; value: string | number | boolean | BridgeMode } | null {
  if (!definition.env || definition.env.length === 0) return null;

  for (const envKey of definition.env) {
    const raw = trimToUndefined(env[envKey]);
    if (raw === undefined) continue;
    return {
      key: envKey,
      value: coerceConfigVarInput(definition, raw),
    };
  }

  return null;
}

function getSection(
  config: PubConfig,
  section: ConfigSection,
): Record<string, unknown> | undefined {
  if (section === "core") return config.core as Record<string, unknown> | undefined;
  if (section === "bridge") return config.bridge as Record<string, unknown> | undefined;
  return config.telegram as Record<string, unknown> | undefined;
}

export function readPubConfigValue(config: PubConfig, definition: ConfigVarDefinition): unknown {
  const section = getSection(config, definition.section);
  return section?.[definition.field];
}

export function writePubConfigValue(
  config: PubConfig,
  definition: ConfigVarDefinition,
  value: unknown,
): void {
  if (definition.section === "core") {
    config.core ??= {};
    (config.core as Record<string, unknown>)[definition.field] = value;
    return;
  }

  if (definition.section === "bridge") {
    config.bridge ??= {};
    (config.bridge as Record<string, unknown>)[definition.field] = value;
    return;
  }

  config.telegram ??= {};
  (config.telegram as Record<string, unknown>)[definition.field] = value;
}

export function deletePubConfigValue(config: PubConfig, definition: ConfigVarDefinition): void {
  const section = getSection(config, definition.section);
  if (!section) return;
  delete section[definition.field];
}
