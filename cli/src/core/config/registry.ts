import { BRIDGE_MODES, type BridgeMode } from "../../live/bridge/providers/types.js";
import { parsePositiveInteger } from "../utils/number.js";
import {
  type CommandAgentProfile,
  DEFAULT_BASE_URL,
  DEFAULT_COMMAND_AGENT_PROFILE,
  DEFAULT_RELAY_URL,
  type DetachedAgentProvider,
  type PubBridgeConfig,
  type PubConfig,
  type PubTelegramConfig,
  type PubTunnelConfig,
} from "./types.js";

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export type ConfigSection = "core" | "bridge" | "telegram" | "tunnel";
export type ConfigValueType =
  | "string"
  | "boolean"
  | "integer"
  | "bridge-mode"
  | "agent-profile"
  | "detached-agent-provider";
export type ConfigDisplayMode = "value" | "set-only";

export type ConfigVarDefinition = {
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
};

function declareConfigVar(definition: ConfigVarDefinition): ConfigVarDefinition {
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

function tunnelVar(
  key: string,
  field: keyof PubTunnelConfig,
  type: ConfigValueType,
  definition: Omit<ConfigVarDefinition, "key" | "section" | "field" | "type">,
): ConfigVarDefinition {
  return declareConfigVar({ key, section: "tunnel", field, type, ...definition });
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
  declareConfigVar({
    key: "telemetry",
    section: "core",
    field: "telemetry",
    type: "boolean",
    description: "Enable performance telemetry (Sentry tracing).",
    env: ["PUB_TELEMETRY"],
    defaultValue: true,
  }),
  declareConfigVar({
    key: "sentryDsn",
    section: "core",
    field: "sentryDsn",
    type: "string",
    description: "Sentry DSN for CLI telemetry.",
    env: ["PUB_SENTRY_DSN"],
  }),
  bridgeVar("bridge.mode", "mode", "bridge-mode", {
    description: "Selected live bridge runtime.",
  }),
  bridgeVar("bridge.verbose", "verbose", "boolean", {
    description: "Enable verbose live daemon logging.",
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
  bridgeVar("claude-channel.socketPath", "channelSocketPath", "string", {
    description: "Unix socket path for the claude-channel relay.",
    env: ["PUB_CHANNEL_SOCKET_PATH"],
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
  bridgeVar("command.agent.defaultProfile", "commandAgentDefaultProfile", "agent-profile", {
    description: "Default profile used for detached canvas agent commands.",
    env: ["PUB_COMMAND_AGENT_DEFAULT_PROFILE"],
    defaultValue: DEFAULT_COMMAND_AGENT_PROFILE,
  }),
  bridgeVar(
    "command.agent.detachedProvider",
    "commandAgentDetachedProvider",
    "detached-agent-provider",
    {
      description: "Default provider used for detached canvas agent commands.",
      env: ["PUB_COMMAND_AGENT_DETACHED_PROVIDER"],
    },
  ),
  bridgeVar("claude-code.commandModelDefault", "claudeCodeCommandModelDefault", "string", {
    description: "Claude detached model used for default-profile agent commands.",
    env: ["CLAUDE_CODE_COMMAND_MODEL_DEFAULT"],
  }),
  bridgeVar("claude-code.commandModelFast", "claudeCodeCommandModelFast", "string", {
    description: "Claude detached model used for fast-profile agent commands.",
    env: ["CLAUDE_CODE_COMMAND_MODEL_FAST"],
  }),
  bridgeVar("claude-code.commandModelDeep", "claudeCodeCommandModelDeep", "string", {
    description: "Claude detached model used for deep-profile agent commands.",
    env: ["CLAUDE_CODE_COMMAND_MODEL_DEEP"],
  }),
  bridgeVar("claude-sdk.commandModelDefault", "claudeSdkCommandModelDefault", "string", {
    description: "Claude SDK detached model used for default-profile agent commands.",
    env: ["CLAUDE_SDK_COMMAND_MODEL_DEFAULT"],
  }),
  bridgeVar("claude-sdk.commandModelFast", "claudeSdkCommandModelFast", "string", {
    description: "Claude SDK detached model used for fast-profile agent commands.",
    env: ["CLAUDE_SDK_COMMAND_MODEL_FAST"],
  }),
  bridgeVar("claude-sdk.commandModelDeep", "claudeSdkCommandModelDeep", "string", {
    description: "Claude SDK detached model used for deep-profile agent commands.",
    env: ["CLAUDE_SDK_COMMAND_MODEL_DEEP"],
  }),
  tunnelVar("tunnel.devCommand", "devCommand", "string", {
    description: "Dev server command (e.g., 'pnpm dev').",
    env: ["PUB_DEV_COMMAND"],
  }),
  tunnelVar("tunnel.devCwd", "devCwd", "string", {
    description: "Working directory for the dev server command.",
    env: ["PUB_DEV_CWD"],
  }),
  tunnelVar("tunnel.devPort", "devPort", "integer", {
    description: "Dev server port.",
    env: ["PUB_DEV_PORT"],
  }),
  tunnelVar("tunnel.relayUrl", "relayUrl", "string", {
    description: "Tunnel relay URL.",
    env: ["PUB_RELAY_URL"],
    defaultValue: DEFAULT_RELAY_URL,
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

const CONFIG_VAR_REGISTRY: Record<string, ConfigVarDefinition> = Object.fromEntries(
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
  if ((BRIDGE_MODES as readonly string[]).includes(normalized)) {
    return normalized as BridgeMode;
  }
  throw new Error(`Invalid bridge mode for ${key}: ${raw}`);
}

function parseAgentProfileValue(raw: string, key: string): CommandAgentProfile {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "fast" || normalized === "default" || normalized === "deep") {
    return normalized;
  }
  throw new Error(`Invalid agent profile for ${key}: ${raw}`);
}

function parseDetachedAgentProviderValue(raw: string, key: string): DetachedAgentProvider {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "claude-code" || normalized === "claude-sdk" || normalized === "openclaw") {
    return normalized;
  }
  throw new Error(`Invalid detached agent provider for ${key}: ${raw}`);
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
): string | number | boolean | BridgeMode | CommandAgentProfile | DetachedAgentProvider {
  if (definition.type === "integer") return parsePositiveInteger(raw, definition.key);
  if (definition.type === "boolean") return parseBooleanValue(raw, definition.key);
  if (definition.type === "bridge-mode") return parseBridgeModeValue(raw, definition.key);
  if (definition.type === "agent-profile") return parseAgentProfileValue(raw, definition.key);
  if (definition.type === "detached-agent-provider") {
    return parseDetachedAgentProviderValue(raw, definition.key);
  }
  return raw.trim();
}

export function readEnvOverride(
  definition: ConfigVarDefinition,
  env: NodeJS.ProcessEnv = process.env,
): {
  key: string;
  value: string | number | boolean | BridgeMode | CommandAgentProfile | DetachedAgentProvider;
} | null {
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
  if (section === "tunnel") return config.tunnel as Record<string, unknown> | undefined;
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

  if (definition.section === "tunnel") {
    config.tunnel ??= {};
    (config.tunnel as Record<string, unknown>)[definition.field] = value;
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
