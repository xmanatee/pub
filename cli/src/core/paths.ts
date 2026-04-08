import * as path from "node:path";
import { homedir } from "node:os";

/**
 * Every environment variable that {@link resolvePubPaths} reads.
 * Tests that override HOME must clear all of these to avoid ambient leakage.
 * A structural test in paths.test.ts enforces that this list stays complete.
 */
export const PATH_ENV_VARS = [
  "HOME",
  "USERPROFILE",
  "PUB_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "XDG_RUNTIME_DIR",
] as const;

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

function readAbsoluteEnvPath(envKey: string, env: NodeJS.ProcessEnv): string | undefined {
  const raw = trimToUndefined(env[envKey]);
  if (!raw) return undefined;
  if (!path.isAbsolute(raw)) {
    throw new Error(`${envKey} must be an absolute path.`);
  }
  return path.resolve(raw);
}

function resolveXdgRoot(params: {
  envKey: string;
  fallbackSegments: string[];
  env: NodeJS.ProcessEnv;
}): string {
  const configured = readAbsoluteEnvPath(params.envKey, params.env);
  if (configured) return path.join(configured, "pub");
  return path.join(resolveBaseHome(params.env), ...params.fallbackSegments, "pub");
}

export interface PubPaths {
  pubHome?: string;
  configRoot: string;
  configPath: string;
  dataRoot: string;
  canvasRoot: string;
  stateRoot: string;
  runtimeRoot: string;
  workspaceRoot: string;
  socketRoot: string;
  daemonRoot: string;
  daemonLogRoot: string;
  sessionRuntimeRoot: string;
}

export function resolvePubPaths(env: NodeJS.ProcessEnv = process.env): PubPaths {
  const pubHome = readAbsoluteEnvPath("PUB_HOME", env);
  if (pubHome) {
    const runtimeRoot = path.join(pubHome, "runtime");
    return {
      pubHome,
      configRoot: path.join(pubHome, "config"),
      configPath: path.join(pubHome, "config", "config.json"),
      dataRoot: path.join(pubHome, "data"),
      canvasRoot: path.join(pubHome, "canvas"),
      stateRoot: path.join(pubHome, "state"),
      runtimeRoot,
      workspaceRoot: path.join(pubHome, "workspaces"),
      socketRoot: path.join(pubHome, "sockets"),
      daemonRoot: path.join(runtimeRoot, "daemon"),
      daemonLogRoot: path.join(runtimeRoot, "daemon", "logs"),
      sessionRuntimeRoot: path.join(runtimeRoot, "sessions"),
    };
  }
  const configRoot = resolveXdgRoot({
    envKey: "XDG_CONFIG_HOME",
    fallbackSegments: [".config"],
    env,
  });
  const dataRoot = resolveXdgRoot({
    envKey: "XDG_DATA_HOME",
    fallbackSegments: [".local", "share"],
    env,
  });
  const stateRoot = resolveXdgRoot({
    envKey: "XDG_STATE_HOME",
    fallbackSegments: [".local", "state"],
    env,
  });
  const runtimeBase =
    readAbsoluteEnvPath("XDG_RUNTIME_DIR", env) || path.join(stateRoot, "runtime-host");
  const runtimeRoot = path.join(stateRoot, "runtime");
  const socketRoot = path.join(runtimeBase, "pub", "sockets");

  return {
    pubHome,
    configRoot,
    configPath: path.join(configRoot, "config.json"),
    dataRoot,
    canvasRoot: path.join(dataRoot, "canvas"),
    stateRoot,
    runtimeRoot,
    workspaceRoot: path.join(stateRoot, "workspaces"),
    socketRoot,
    daemonRoot: path.join(runtimeRoot, "daemon"),
    daemonLogRoot: path.join(runtimeRoot, "daemon", "logs"),
    sessionRuntimeRoot: path.join(runtimeRoot, "sessions"),
  };
}

export function resolveConfigRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolvePubPaths(env).configRoot;
}

export function resolveConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolvePubPaths(env).configPath;
}
