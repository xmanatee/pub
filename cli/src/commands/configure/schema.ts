import type { BridgeConfig, TelegramConfig } from "../../lib/config.js";
import { parsePositiveInteger } from "../../lib/number.js";

export function parseSetInput(raw: string): { key: string; value: string } {
  const sepIndex = raw.indexOf("=");
  if (sepIndex <= 0 || sepIndex === raw.length - 1) {
    throw new Error(`Invalid --set entry "${raw}". Use key=value.`);
  }
  return {
    key: raw.slice(0, sepIndex).trim(),
    value: raw.slice(sepIndex + 1).trim(),
  };
}

export function parseBooleanValue(raw: string, key: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on")
    return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off")
    return false;
  throw new Error(`Invalid boolean value for ${key}: ${raw}`);
}

export interface ConfigKeyDef {
  target: "bridge" | "telegram";
  field: keyof BridgeConfig | keyof TelegramConfig;
  type: "string" | "boolean" | "integer";
  displayAs?: "set-only";
  cascadeUnset?: Array<keyof TelegramConfig>;
}

export const CONFIG_KEY_REGISTRY: Record<string, ConfigKeyDef> = {
  "openclaw.path": { target: "bridge", field: "openclawPath", type: "string" },
  "openclaw.stateDir": { target: "bridge", field: "openclawStateDir", type: "string" },
  "openclaw.sessionId": { target: "bridge", field: "sessionId", type: "string" },
  "openclaw.threadId": { target: "bridge", field: "threadId", type: "string" },
  "openclaw.canvasReminderEvery": {
    target: "bridge",
    field: "canvasReminderEvery",
    type: "integer",
  },
  "openclaw.deliver": { target: "bridge", field: "deliver", type: "boolean" },
  "openclaw.deliverChannel": { target: "bridge", field: "deliverChannel", type: "string" },
  "openclaw.replyTo": { target: "bridge", field: "replyTo", type: "string" },
  "openclaw.deliverTimeoutMs": { target: "bridge", field: "deliverTimeoutMs", type: "integer" },
  "openclaw.attachmentDir": { target: "bridge", field: "attachmentDir", type: "string" },
  "openclaw.attachmentMaxBytes": { target: "bridge", field: "attachmentMaxBytes", type: "integer" },
  "claude-code.path": { target: "bridge", field: "claudeCodePath", type: "string" },
  "claude-code.model": { target: "bridge", field: "claudeCodeModel", type: "string" },
  "claude-code.allowedTools": { target: "bridge", field: "claudeCodeAllowedTools", type: "string" },
  "claude-code.appendSystemPrompt": {
    target: "bridge",
    field: "claudeCodeAppendSystemPrompt",
    type: "string",
    displayAs: "set-only",
  },
  "claude-code.maxTurns": { target: "bridge", field: "claudeCodeMaxTurns", type: "integer" },
  "claude-code.cwd": { target: "bridge", field: "claudeCodeCwd", type: "string" },
  "telegram.botToken": {
    target: "telegram",
    field: "botToken",
    type: "string",
    cascadeUnset: ["botUsername", "hasMainWebApp"],
  },
};

export const SUPPORTED_KEYS = Object.keys(CONFIG_KEY_REGISTRY);

function coerceValue(
  raw: string,
  type: ConfigKeyDef["type"],
  key: string,
): string | number | boolean {
  if (type === "integer") return parsePositiveInteger(raw, key);
  if (type === "boolean") return parseBooleanValue(raw, key);
  return raw;
}

export function applyConfigSet(
  bridge: BridgeConfig,
  telegram: TelegramConfig,
  key: string,
  value: string,
): void {
  const def = CONFIG_KEY_REGISTRY[key];
  if (!def) {
    throw new Error(
      [
        `Unknown config key: ${key}`,
        "Supported keys:",
        ...SUPPORTED_KEYS.map((k) => `  ${k}`),
      ].join("\n"),
    );
  }
  const coerced = coerceValue(value, def.type, key);
  if (def.target === "bridge") {
    Object.assign(bridge, { [def.field]: coerced });
  } else {
    Object.assign(telegram, { [def.field]: coerced });
  }
}

export function applyConfigUnset(
  bridge: BridgeConfig,
  telegram: TelegramConfig,
  key: string,
): void {
  const def = CONFIG_KEY_REGISTRY[key];
  if (!def) {
    throw new Error(`Unknown config key for --unset: ${key}`);
  }
  if (def.target === "bridge") {
    delete bridge[def.field as keyof BridgeConfig];
  } else {
    delete telegram[def.field as keyof TelegramConfig];
    if (def.cascadeUnset) {
      for (const cascadeField of def.cascadeUnset) {
        delete telegram[cascadeField];
      }
    }
  }
}

export function hasValues(obj: object): boolean {
  return Object.values(obj).some((value) => value !== undefined);
}
