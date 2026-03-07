import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveBaseHome(env: NodeJS.ProcessEnv): string {
  const envHome = trimToUndefined(env.HOME);
  if (envHome) return resolve(envHome);

  const userProfile = trimToUndefined(env.USERPROFILE);
  if (userProfile) return resolve(userProfile);

  try {
    return resolve(homedir());
  } catch {
    return resolve(process.cwd());
  }
}

function expandHomePrefix(input: string, home: string): string {
  if (input === "~") return home;
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return join(home, input.slice(2));
  }
  return input;
}

function resolvePathFromInput(input: string, env: NodeJS.ProcessEnv = process.env): string {
  const home = resolveOpenClawHome(env);
  return resolve(expandHomePrefix(input.trim(), home));
}

export function resolveOpenClawHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = trimToUndefined(env.OPENCLAW_HOME);
  if (explicit) {
    return resolve(expandHomePrefix(explicit, resolveBaseHome(env)));
  }
  return resolveBaseHome(env);
}

export function resolveOpenClawStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = trimToUndefined(env.OPENCLAW_STATE_DIR);
  if (configured) return resolvePathFromInput(configured, env);
  return join(resolveOpenClawHome(env), ".openclaw");
}

export function resolveOpenClawConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = trimToUndefined(env.OPENCLAW_CONFIG_PATH);
  if (configured) return resolvePathFromInput(configured, env);
  return join(resolveOpenClawStateDir(env), "openclaw.json");
}

function readWorkspaceFromOpenClawConfig(configPath: string): string | null {
  if (!existsSync(configPath)) return null;
  try {
    const cfg = JSON.parse(readFileSync(configPath, "utf-8")) as {
      workspace?: unknown;
      agents?: { defaults?: { workspace?: unknown } };
    };

    const defaultsWorkspace = cfg.agents?.defaults?.workspace;
    if (typeof defaultsWorkspace === "string" && defaultsWorkspace.trim()) {
      return defaultsWorkspace.trim();
    }

    const legacyWorkspace = cfg.workspace;
    if (typeof legacyWorkspace === "string" && legacyWorkspace.trim()) {
      return legacyWorkspace.trim();
    }
  } catch {
    // ignore parse errors and fall back to default workspace path
  }
  return null;
}

function resolveWorkspacePath(input: string, configPath: string, env: NodeJS.ProcessEnv): string {
  const home = resolveOpenClawHome(env);
  const expanded = expandHomePrefix(input, home);
  if (isAbsolute(expanded)) return resolve(expanded);
  return resolve(dirname(configPath), expanded);
}

export function resolveOpenClawWorkspaceDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = trimToUndefined(env.OPENCLAW_WORKSPACE);
  if (explicit) return resolvePathFromInput(explicit, env);

  const configPath = resolveOpenClawConfigPath(env);
  const fromConfig = readWorkspaceFromOpenClawConfig(configPath);
  if (fromConfig) return resolveWorkspacePath(fromConfig, configPath, env);

  return join(resolveOpenClawStateDir(env), "workspace");
}
