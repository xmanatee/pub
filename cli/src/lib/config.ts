import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { BridgeMode } from "./live-daemon-shared.js";

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

type ConfigDirSource =
  "PUB_CONFIG_DIR" | "OPENCLAW_HOME" | "HOME_CONFIG";

interface ConfigDirCandidate {
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

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveBaseHome(env: NodeJS.ProcessEnv = process.env): string {
  const envHome = trimToUndefined(env.HOME);
  if (envHome) return path.resolve(envHome);

  const userProfile = trimToUndefined(env.USERPROFILE);
  if (userProfile) return path.resolve(userProfile);

  try {
    return path.resolve(homedir());
  } catch {
    return path.resolve(process.cwd());
  }
}

function expandHomePrefix(input: string, env: NodeJS.ProcessEnv = process.env): string {
  const home = resolveBaseHome(env);
  if (input === "~") return home;
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(home, input.slice(2));
  }
  return input;
}

function resolveInputPath(input: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(expandHomePrefix(input.trim(), env));
}

function pathExists(targetPath: string): boolean {
  return fs.existsSync(targetPath);
}

function describeCandidate(candidate: ConfigDirCandidate): string {
  const status = candidate.exists ? "exists" : "missing";
  return `- ${candidate.dir} (${candidate.source}, ${status})`;
}

function getExplicitConfigDirCandidate(
  env: NodeJS.ProcessEnv = process.env,
): ConfigDirCandidate | null {
  const explicitPub = trimToUndefined(env.PUB_CONFIG_DIR);

  if (explicitPub) {
    const dir = resolveInputPath(explicitPub, env);
    return {
      dir,
      exists: pathExists(dir),
      source: "PUB_CONFIG_DIR",
      description: "configured by PUB_CONFIG_DIR",
    };
  }

  return null;
}

export function listConfigDirCandidates(
  env: NodeJS.ProcessEnv = process.env,
): ConfigDirCandidate[] {
  const candidates: ConfigDirCandidate[] = [];

  const explicit = getExplicitConfigDirCandidate(env);
  if (explicit) candidates.push(explicit);

  const openclawHome = trimToUndefined(env.OPENCLAW_HOME);
  if (openclawHome) {
    const dir = path.join(resolveInputPath(openclawHome, env), ".openclaw", "pub");
    candidates.push({
      dir,
      exists: pathExists(dir),
      source: "OPENCLAW_HOME",
      description: "derived from OPENCLAW_HOME/.openclaw/pub",
    });
  }

  const homeConfigDir = path.join(resolveBaseHome(env), ".configs", "pub");
  candidates.push({
    dir: homeConfigDir,
    exists: pathExists(homeConfigDir),
    source: "HOME_CONFIG",
    description: "derived from ~/.configs/pub",
  });

  return candidates;
}

export function resolveConfigLocation(env: NodeJS.ProcessEnv = process.env): ConfigLocation {
  const candidates = listConfigDirCandidates(env);
  const existing = candidates.filter((candidate) => candidate.exists);

  if (existing.length > 1) {
    throw new Error(
      [
        "Ambiguous Pub config directories detected.",
        "Remove redundant config directories so only one remains.",
        ...existing.map(describeCandidate),
      ].join("\n"),
    );
  }

  if (existing.length === 0) {
    throw new Error(
      [
        "No Pub config directory found.",
        "Create exactly one of these directories and retry:",
        ...candidates.map(describeCandidate),
      ].join("\n"),
    );
  }

  const selected = existing[0];
  return {
    dir: selected.dir,
    path: path.join(selected.dir, "config.json"),
    source: selected.source,
    description: selected.description,
  };
}

export function getConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveConfigLocation(env).dir;
}

export function getConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveConfigLocation(env).path;
}

function ensureConfigParentDir(configPath: string): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): SavedConfig | null {
  const configPath = getConfigPath(env);
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as SavedConfig;
}

export function saveConfig(config: SavedConfig, env: NodeJS.ProcessEnv = process.env): void {
  const configPath = getConfigPath(env);
  ensureConfigParentDir(configPath);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

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

export function getTelegramMiniAppUrl(slug: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const saved = readConfig(env);
  if (!saved?.telegram?.botUsername) return null;
  return `https://t.me/${saved.telegram.botUsername}?startapp=${slug}`;
}
