import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PubBridgeConfig } from "../../../../core/config/index.js";
import { resolveCommandFromPath } from "../command-path.js";
import { resolveOpenClawHome } from "./paths.js";
import { resolveMainSessionFromOpenClaw } from "./session.js";

function getOpenClawDiscoveryPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = resolveOpenClawHome(env);
  return [
    ...new Set([
      "/app/dist/index.js",
      join(home, "openclaw", "dist", "index.js"),
      join(home, ".openclaw", "openclaw"),
      "/usr/local/bin/openclaw",
      "/opt/homebrew/bin/openclaw",
    ]),
  ];
}

function getConfiguredOpenClawPath(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string | undefined {
  return env.OPENCLAW_PATH?.trim() || bridgeConfig?.openclawPath?.trim();
}

function getConfiguredOpenClawSessionId(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string | undefined {
  return env.OPENCLAW_SESSION_ID?.trim() || bridgeConfig?.sessionId?.trim();
}

function buildOpenClawLookupEnv(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): NodeJS.ProcessEnv {
  const stateDir = env.OPENCLAW_STATE_DIR?.trim() || bridgeConfig?.openclawStateDir?.trim();
  if (!stateDir) return env;
  return { ...env, OPENCLAW_STATE_DIR: stateDir };
}

export function isOpenClawAvailable(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): boolean {
  const configured = getConfiguredOpenClawPath(env, bridgeConfig);
  if (configured) return existsSync(configured);
  const pathFromShell = resolveCommandFromPath("openclaw");
  if (pathFromShell) return true;
  return getOpenClawDiscoveryPaths(buildOpenClawLookupEnv(env, bridgeConfig)).some((entry) =>
    existsSync(entry),
  );
}

export function resolveOpenClawPath(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string {
  const configuredPath = getConfiguredOpenClawPath(env, bridgeConfig);
  if (configuredPath) {
    if (!existsSync(configuredPath)) {
      throw new Error(`OPENCLAW_PATH does not exist: ${configuredPath}`);
    }
    return configuredPath;
  }

  const pathFromShell = resolveCommandFromPath("openclaw");
  if (pathFromShell) return pathFromShell;

  const discoveryPaths = getOpenClawDiscoveryPaths(buildOpenClawLookupEnv(env, bridgeConfig));
  for (const candidate of discoveryPaths) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    [
      "OpenClaw executable was not found.",
      "Configure it with: pub config --set openclaw.path=/absolute/path/to/openclaw",
      "Or set OPENCLAW_PATH in environment.",
      `Checked: ${discoveryPaths.join(", ")}`,
    ].join(" "),
  );
}

export interface OpenClawRuntimeResolution {
  openclawPath: string;
  sessionId: string;
}

export function resolveOpenClawRuntime(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): OpenClawRuntimeResolution {
  const openclawPath = resolveOpenClawPath(env, bridgeConfig);
  const configuredSessionId = getConfiguredOpenClawSessionId(env, bridgeConfig);

  if (configuredSessionId) {
    return { openclawPath, sessionId: configuredSessionId };
  }

  const resolved = resolveMainSessionFromOpenClaw(buildOpenClawLookupEnv(env, bridgeConfig));
  if (resolved.sessionId) {
    return { openclawPath, sessionId: resolved.sessionId };
  }

  throw new Error(
    [
      "OpenClaw session could not be resolved.",
      resolved.readError ? `Session lookup error: ${resolved.readError}` : "",
      "Configure with: pub config --set openclaw.sessionId=<session-id>",
      "Or set OPENCLAW_SESSION_ID in environment.",
      "Or run `pub config --auto` to auto-detect.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

export function resolveAutoDetectOpenClawCommandCwd(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const envWorkspace = env.OPENCLAW_WORKSPACE?.trim();
  if (envWorkspace) return envWorkspace;
  throw new Error(
    "OpenClaw workspace is not configured. Set OPENCLAW_WORKSPACE before `pub config --auto`.",
  );
}
