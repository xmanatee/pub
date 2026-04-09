import * as fs from "node:fs";
import * as path from "node:path";
import { getConfigPath } from "./location.js";
import { compactPubConfig } from "./mutate.js";
import type {
  PubBridgeConfig,
  PubConfig,
  PubCoreConfig,
  PubTelegramConfig,
  PubTunnelConfig,
} from "./types.js";

function ensureConfigParentDir(configPath: string): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readCoreConfig(root: Record<string, unknown>): PubCoreConfig | undefined {
  const core = asRecord(root.core);
  if (!core) return undefined;

  const normalized: PubCoreConfig = {
    apiKey: typeof core.apiKey === "string" ? core.apiKey : undefined,
    baseUrl: typeof core.baseUrl === "string" ? core.baseUrl : undefined,
    telemetry: typeof core.telemetry === "boolean" ? core.telemetry : undefined,
    sentryDsn: typeof core.sentryDsn === "string" ? core.sentryDsn : undefined,
  };

  return Object.values(normalized).some((value) => value !== undefined) ? normalized : undefined;
}

function readBridgeConfig(root: Record<string, unknown>): PubBridgeConfig | undefined {
  const bridge = asRecord(root.bridge);
  return bridge ? (bridge as unknown as PubBridgeConfig) : undefined;
}

function readTelegramConfig(root: Record<string, unknown>): PubTelegramConfig | undefined {
  const telegram = asRecord(root.telegram);
  return telegram ? (telegram as unknown as PubTelegramConfig) : undefined;
}

function readTunnelConfig(root: Record<string, unknown>): PubTunnelConfig | undefined {
  const tunnel = asRecord(root.tunnel);
  return tunnel ? (tunnel as unknown as PubTunnelConfig) : undefined;
}

function normalizePubConfig(input: unknown): PubConfig {
  const root = asRecord(input);
  if (!root) return {};

  return compactPubConfig({
    core: readCoreConfig(root),
    bridge: readBridgeConfig(root),
    telegram: readTelegramConfig(root),
    tunnel: readTunnelConfig(root),
  });
}

export function readPubConfig(env: NodeJS.ProcessEnv = process.env): PubConfig | null {
  const configPath = getConfigPath(env);
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, "utf-8");
  return normalizePubConfig(JSON.parse(raw));
}

export function writePubConfig(config: PubConfig, env: NodeJS.ProcessEnv = process.env): void {
  const configPath = getConfigPath(env);
  ensureConfigParentDir(configPath);
  fs.writeFileSync(configPath, `${JSON.stringify(compactPubConfig(config), null, 2)}\n`, {
    mode: 0o600,
  });
}
