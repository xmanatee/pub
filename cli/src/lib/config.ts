import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface Config {
  apiKey: string;
  baseUrl: string;
}

export function getConfigDir(homeDir?: string): string {
  const home = homeDir || os.homedir();
  return path.join(home, ".config", "publish");
}

function getConfigPath(homeDir?: string): string {
  const dir = getConfigDir(homeDir);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "config.json");
}

export function loadConfig(homeDir?: string): Config | null {
  const configPath = getConfigPath(homeDir);
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as Config;
}

export function saveConfig(config: Config, homeDir?: string): void {
  const configPath = getConfigPath(homeDir);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export function getConfig(homeDir?: string): Config {
  const envKey = process.env.PUBLISH_API_KEY;
  const envUrl = process.env.PUBLISH_URL;

  if (envKey && envUrl) {
    return { apiKey: envKey, baseUrl: envUrl };
  }

  const saved = loadConfig(homeDir);
  if (!saved) {
    throw new Error(
      "Not configured. Run `publish configure` or set PUBLISH_API_KEY and PUBLISH_URL environment variables.",
    );
  }

  return {
    apiKey: envKey || saved.apiKey,
    baseUrl: envUrl || saved.baseUrl,
  };
}
