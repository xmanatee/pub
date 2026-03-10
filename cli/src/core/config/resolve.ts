import { readConfig } from "./store.js";
import {
  DEFAULT_BASE_URL,
  type BridgeConfig,
  type RequiredConfig,
  type ResolvedConfig,
  type TelegramConfig,
} from "./types.js";
import { trimToUndefined } from "./location.js";

function readEnvValue(
  keys: string[],
  env: NodeJS.ProcessEnv = process.env,
): { key: string; value: string } | null {
  for (const key of keys) {
    const value = trimToUndefined(env[key]);
    if (value) return { key, value };
  }
  return null;
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): ResolvedConfig {
  const saved = readConfig(env);
  const envApiKey = readEnvValue(["PUB_API_KEY"], env);
  const envBaseUrl = readEnvValue(["PUB_BASE_URL"], env);
  const bridge: BridgeConfig = saved?.bridge ? { ...saved.bridge } : {};

  const telegram: TelegramConfig = {
    botToken: saved?.telegram?.botToken,
    botUsername: saved?.telegram?.botUsername,
    hasMainWebApp: saved?.telegram?.hasMainWebApp,
  };

  return {
    apiKey: envApiKey
      ? { value: envApiKey.value, source: "env", envKey: envApiKey.key }
      : saved?.apiKey
        ? { value: saved.apiKey, source: "config" }
        : null,
    baseUrl: envBaseUrl
      ? { value: envBaseUrl.value, source: "env", envKey: envBaseUrl.key }
      : { value: DEFAULT_BASE_URL, source: "default" },
    bridge,
    telegram,
  };
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): ResolvedConfig {
  return resolveConfig(env);
}

export function getRequiredConfig(env: NodeJS.ProcessEnv = process.env): RequiredConfig {
  const resolved = getConfig(env);

  if (!resolved.apiKey) {
    throw new Error("Missing PUB_API_KEY. Set it with `pub config --api-key` or PUB_API_KEY.");
  }

  return {
    apiKey: resolved.apiKey.value,
    baseUrl: resolved.baseUrl.value,
    bridge: Object.keys(resolved.bridge).length > 0 ? resolved.bridge : undefined,
  };
}

export function getTelegramMiniAppUrl(
  slug: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const saved = readConfig(env);
  if (!saved?.telegram?.botUsername) return null;
  return `https://t.me/${saved.telegram.botUsername}?startapp=${slug}`;
}
