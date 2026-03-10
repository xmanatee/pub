import { homedir } from "node:os";
import { join, resolve } from "node:path";

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
