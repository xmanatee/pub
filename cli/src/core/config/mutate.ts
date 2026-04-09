import {
  coerceConfigVarInput,
  deletePubConfigValue,
  getConfigVar,
  getConfigVarsBySection,
  isMutableConfigVar,
  readPubConfigValue,
  SUPPORTED_CONFIG_KEYS,
  writePubConfigValue,
} from "./registry.js";
import type { ConfigVarDefinition, ConfigSection } from "./registry.js";
import type { PubConfig } from "./types.js";

export function parseConfigAssignment(raw: string): { key: string; value: string } {
  const separatorIndex = raw.indexOf("=");
  if (separatorIndex <= 0 || separatorIndex === raw.length - 1) {
    throw new Error(`Invalid --set entry "${raw}". Use key=value.`);
  }

  return {
    key: raw.slice(0, separatorIndex).trim(),
    value: raw.slice(separatorIndex + 1).trim(),
  };
}

function hasConfigValues(obj: object | undefined): boolean {
  if (!obj) return false;
  return Object.values(obj).some((value) => value !== undefined);
}

export function compactPubConfig(config: PubConfig): PubConfig {
  if (!hasConfigValues(config.core)) delete config.core;
  if (!hasConfigValues(config.bridge)) delete config.bridge;
  if (!hasConfigValues(config.telegram)) delete config.telegram;
  if (!hasConfigValues(config.tunnel)) delete config.tunnel;
  return config;
}

function requireMutableConfigVar(key: string) {
  const definition = getConfigVar(key);
  if (!definition) {
    throw new Error(
      [
        `Unknown config key: ${key}`,
        "Supported keys:",
        ...SUPPORTED_CONFIG_KEYS.map((entry) => `  ${entry}`),
      ].join("\n"),
    );
  }
  if (!isMutableConfigVar(definition)) {
    throw new Error(`Config key is derived and cannot be set directly: ${key}`);
  }
  return definition;
}

function applyCascadeUnset(config: PubConfig, definition: ConfigVarDefinition): void {
  if (definition.cascadeUnset) {
    for (const dependentKey of definition.cascadeUnset) {
      const dependentDefinition = getConfigVar(dependentKey);
      if (!dependentDefinition) continue;
      deletePubConfigValue(config, dependentDefinition);
    }
  }
}

export function setPubConfigValue(config: PubConfig, key: string, rawValue: string): void {
  const definition = requireMutableConfigVar(key);
  writePubConfigValue(config, definition, coerceConfigVarInput(definition, rawValue));
  applyCascadeUnset(config, definition);
  compactPubConfig(config);
}

export function unsetPubConfigValue(config: PubConfig, key: string): void {
  const definition = requireMutableConfigVar(key);
  deletePubConfigValue(config, definition);
  applyCascadeUnset(config, definition);
  compactPubConfig(config);
}

export function listConfiguredKeys(config: PubConfig, section: ConfigSection): string[] {
  return getConfigVarsBySection(section)
    .filter((definition) => readPubConfigValue(config, definition) !== undefined)
    .map((definition) => definition.key);
}
