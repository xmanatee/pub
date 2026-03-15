import {
  getConfigVars,
  readEnvOverride,
  readPubConfigValue,
} from "./registry.js";
import { readPubConfig } from "./store.js";
import type {
  ApiClientSettings,
  PubConfig,
  ResolvedPubSettings,
  ResolvedValue,
} from "./types.js";

function toResolvedValue(value: unknown, source: "config" | "default"): ResolvedValue<unknown> {
  return { value, source };
}

function resolvePubSettingsFromConfig(
  rawConfig: PubConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedPubSettings {
  const valuesByKey: Record<string, ResolvedValue<unknown> | null> = {};

  for (const definition of getConfigVars()) {
    const envOverride = readEnvOverride(definition, env);
    if (envOverride) {
      valuesByKey[definition.key] = {
        value: envOverride.value,
        source: "env",
        envKey: envOverride.key,
      };
      continue;
    }

    const configValue = readPubConfigValue(rawConfig, definition);
    if (configValue !== undefined) {
      valuesByKey[definition.key] = toResolvedValue(configValue, "config");
      continue;
    }

    if (definition.defaultValue !== undefined) {
      valuesByKey[definition.key] = toResolvedValue(definition.defaultValue, "default");
      continue;
    }

    valuesByKey[definition.key] = null;
  }

  const resolvedApiKey = valuesByKey.apiKey as ResolvedValue<string> | null;
  const resolvedBaseUrl = valuesByKey.baseUrl as ResolvedValue<string>;

  return {
    rawConfig,
    core: {
      apiKey: resolvedApiKey,
      baseUrl: resolvedBaseUrl,
    },
    valuesByKey,
  };
}

export function resolvePubSettings(env: NodeJS.ProcessEnv = process.env): ResolvedPubSettings {
  return resolvePubSettingsFromConfig(readPubConfig(env) ?? {}, env);
}

export function getResolvedSettingValue<T>(
  resolved: ResolvedPubSettings,
  key: string,
): ResolvedValue<T> | null {
  return (resolved.valuesByKey[key] as ResolvedValue<T> | null) ?? null;
}

export function getApiClientSettingsFromConfig(
  rawConfig: PubConfig,
  env: NodeJS.ProcessEnv = process.env,
): ApiClientSettings {
  const resolved = resolvePubSettingsFromConfig(rawConfig, env);
  if (!resolved.core.apiKey) {
    throw new Error("Missing apiKey. Set it with `pub config --api-key` or PUB_API_KEY.");
  }

  return {
    apiKey: resolved.core.apiKey.value,
    baseUrl: resolved.core.baseUrl.value,
  };
}

export function getApiClientSettings(env: NodeJS.ProcessEnv = process.env): ApiClientSettings {
  return getApiClientSettingsFromConfig(readPubConfig(env) ?? {}, env);
}

export function getTelegramMiniAppUrl(
  slug: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const config = readPubConfig(env);
  const username = config?.telegram?.botUsername?.trim();
  return username ? `https://t.me/${username}?startapp=${slug}` : null;
}
