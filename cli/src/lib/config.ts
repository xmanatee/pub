import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_BASE_URL = "https://silent-guanaco-514.convex.site";

export interface BridgeConfig {
  mode?: "openclaw" | "none";
  openclawPath?: string;
  sessionId?: string;
  threadId?: string;
  canvasReminderEvery?: number;
  deliver?: boolean;
  deliverChannel?: string;
  replyTo?: string;
  deliverTimeoutMs?: number;
  attachmentDir?: string;
  attachmentMaxBytes?: number;
}

export interface TelegramConfig {
  botToken?: string;
  botUsername?: string;
  hasMainWebApp?: boolean;
}

export interface SavedConfig {
  apiKey: string;
  bridge?: BridgeConfig;
  telegram?: TelegramConfig;
}

export interface Config {
  apiKey: string;
  baseUrl: string;
  bridge?: BridgeConfig;
}

export function getConfigDir(homeDir?: string): string {
  const home = homeDir || os.homedir();
  return path.join(home, ".config", "pubblue");
}

function getConfigPath(homeDir?: string): string {
  const dir = getConfigDir(homeDir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Ignore chmod failures on platforms/filesystems that don't support POSIX modes.
  }
  return path.join(dir, "config.json");
}

export function loadConfig(homeDir?: string): SavedConfig | null {
  const configPath = getConfigPath(homeDir);
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as SavedConfig;
}

export function saveConfig(config: SavedConfig, homeDir?: string): void {
  const configPath = getConfigPath(homeDir);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    // Ignore chmod failures on platforms/filesystems that don't support POSIX modes.
  }
}

export function getConfig(homeDir?: string): Config {
  const envKey = process.env.PUBBLUE_API_KEY;
  const envUrl = process.env.PUBBLUE_URL;
  const baseUrl = envUrl || DEFAULT_BASE_URL;
  const saved = loadConfig(homeDir);

  if (envKey) {
    return { apiKey: envKey, baseUrl, bridge: saved?.bridge };
  }

  if (!saved) {
    throw new Error(
      "Not configured. Run `pubblue configure` or set PUBBLUE_API_KEY environment variable.",
    );
  }

  return {
    apiKey: saved.apiKey,
    baseUrl,
    bridge: saved.bridge,
  };
}

export function getTelegramMiniAppUrl(slug: string): string | null {
  const saved = loadConfig();
  if (!saved?.telegram?.botUsername) return null;
  return `https://t.me/${saved.telegram.botUsername}?startapp=${slug}`;
}
