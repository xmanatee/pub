import { resolveConfigPath, resolveConfigRoot } from "../paths.js";
import type { ConfigLocation } from "./types.js";

export function getConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveConfigRoot(env);
}

export function getConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveConfigPath(env);
}

export function resolveConfigLocation(env: NodeJS.ProcessEnv = process.env): ConfigLocation {
  return {
    dir: resolveConfigRoot(env),
    path: resolveConfigPath(env),
    source: "PUB_CONFIG_HOME",
    description: "resolved from PUB_HOME or XDG config conventions",
  };
}
