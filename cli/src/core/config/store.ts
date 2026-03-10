import * as fs from "node:fs";
import * as path from "node:path";
import { getConfigPath } from "./location.js";
import type { SavedConfig } from "./types.js";

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
