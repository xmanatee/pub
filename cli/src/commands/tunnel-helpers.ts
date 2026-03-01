import type { ChildProcess } from "node:child_process";
import { fork } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { failCli } from "../lib/cli-error.js";
import type { BridgeConfig, Config } from "../lib/config.js";
import { getConfig } from "../lib/config.js";
import { TunnelApiClient, TunnelApiError, type TunnelListItem } from "../lib/tunnel-api.js";
import type { BridgeSessionSource } from "../lib/tunnel-bridge-types.js";
import { ipcCall } from "../lib/tunnel-ipc.js";

export const TEXT_FILE_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".xml",
  ".yaml",
  ".yml",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".log",
]);

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeByExt: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".markdown": "text/markdown; charset=utf-8",
    ".json": "application/json",
    ".csv": "text/csv; charset=utf-8",
    ".xml": "application/xml",
    ".yaml": "application/x-yaml",
    ".yml": "application/x-yaml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
  };
  return mimeByExt[ext] || "application/octet-stream";
}

export interface BridgeProcessInfo {
  lastError?: string;
  pid: number;
  tunnelId: string;
  mode: string;
  sessionId?: string;
  sessionKey?: string;
  sessionSource?: BridgeSessionSource;
  startedAt: number;
  status?: string;
}

export interface DaemonProcessInfo {
  cliVersion?: string;
  pid: number;
  socketPath?: string;
  startedAt?: number;
  tunnelId: string;
}

export type BridgeMode = "openclaw" | "none";

export interface DaemonStartTarget {
  createdNew: boolean;
  expiresAt: number;
  mode: "created" | "existing";
  tunnelId: string;
  url: string;
}

export function tunnelInfoDir(): string {
  const dir = path.join(
    process.env.HOME || process.env.USERPROFILE || "/tmp",
    ".config",
    "pubblue",
    "tunnels",
  );
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function tunnelInfoPath(tunnelId: string): string {
  return path.join(tunnelInfoDir(), `${tunnelId}.json`);
}

export function tunnelLogPath(tunnelId: string): string {
  return path.join(tunnelInfoDir(), `${tunnelId}.log`);
}

export function bridgeInfoPath(tunnelId: string): string {
  return path.join(tunnelInfoDir(), `${tunnelId}.bridge.json`);
}

export function bridgeLogPath(tunnelId: string): string {
  return path.join(tunnelInfoDir(), `${tunnelId}.bridge.log`);
}

export function createApiClient(configOverride?: Config): TunnelApiClient {
  const config = configOverride || getConfig();
  return new TunnelApiClient(config.baseUrl, config.apiKey);
}

export function buildBridgeProcessEnv(bridgeConfig?: BridgeConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (!bridgeConfig) return env;

  const setIfMissing = (key: string, value: string | number | boolean | undefined) => {
    if (value === undefined || value === null) return;
    const current = env[key];
    if (typeof current === "string" && current.length > 0) return;
    env[key] = String(value);
  };

  setIfMissing("OPENCLAW_PATH", bridgeConfig.openclawPath);
  setIfMissing("OPENCLAW_SESSION_ID", bridgeConfig.sessionId);
  setIfMissing("OPENCLAW_THREAD_ID", bridgeConfig.threadId);
  if (bridgeConfig.canvasReminderEvery !== undefined) {
    setIfMissing("OPENCLAW_CANVAS_REMINDER_EVERY", bridgeConfig.canvasReminderEvery);
  }
  if (bridgeConfig.deliver !== undefined) {
    setIfMissing("OPENCLAW_DELIVER", bridgeConfig.deliver ? "1" : "0");
  }
  setIfMissing("OPENCLAW_DELIVER_CHANNEL", bridgeConfig.deliverChannel);
  setIfMissing("OPENCLAW_REPLY_TO", bridgeConfig.replyTo);
  if (bridgeConfig.deliverTimeoutMs !== undefined) {
    setIfMissing("OPENCLAW_DELIVER_TIMEOUT_MS", bridgeConfig.deliverTimeoutMs);
  }
  setIfMissing("OPENCLAW_ATTACHMENT_DIR", bridgeConfig.attachmentDir);
  if (bridgeConfig.attachmentMaxBytes !== undefined) {
    setIfMissing("OPENCLAW_ATTACHMENT_MAX_BYTES", bridgeConfig.attachmentMaxBytes);
  }
  return env;
}

export async function ensureNodeDatachannelAvailable(): Promise<void> {
  try {
    await import("node-datachannel");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failCli(
      [
        "node-datachannel native module is not available.",
        "Run `pnpm rebuild node-datachannel` in the cli package and retry.",
        `Details: ${message}`,
      ].join("\n"),
    );
  }
}

export function isDaemonRunning(tunnelId: string): boolean {
  return readDaemonProcessInfo(tunnelId) !== null;
}

export function readDaemonProcessInfo(tunnelId: string): DaemonProcessInfo | null {
  const infoPath = tunnelInfoPath(tunnelId);
  if (!fs.existsSync(infoPath)) return null;

  try {
    const info = JSON.parse(fs.readFileSync(infoPath, "utf-8")) as DaemonProcessInfo;
    if (!Number.isFinite(info.pid)) throw new Error("invalid daemon pid");
    process.kill(info.pid, 0);
    return info;
  } catch {
    try {
      fs.unlinkSync(infoPath);
    } catch {
      // stale pid file cleanup failed
    }
    return null;
  }
}

export function readBridgeProcessInfo(tunnelId: string): BridgeProcessInfo | null {
  const infoPath = bridgeInfoPath(tunnelId);
  if (!fs.existsSync(infoPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(infoPath, "utf-8")) as BridgeProcessInfo;
  } catch {
    return null;
  }
}

export function isBridgeRunning(tunnelId: string): boolean {
  const infoPath = bridgeInfoPath(tunnelId);
  if (!fs.existsSync(infoPath)) return false;
  try {
    const info = JSON.parse(fs.readFileSync(infoPath, "utf-8")) as BridgeProcessInfo;
    process.kill(info.pid, 0);
    return true;
  } catch {
    try {
      fs.unlinkSync(infoPath);
    } catch {
      // stale bridge pid cleanup failed
    }
  }
  return false;
}

export function latestCliVersionPath(): string {
  return path.join(tunnelInfoDir(), "cli-version.txt");
}

export function readLatestCliVersion(versionPath?: string): string | null {
  const resolved = versionPath || latestCliVersionPath();
  if (!fs.existsSync(resolved)) return null;
  try {
    const value = fs.readFileSync(resolved, "utf-8").trim();
    return value.length === 0 ? null : value;
  } catch {
    return null;
  }
}

export function writeLatestCliVersion(version: string, versionPath?: string): void {
  if (!version || version.trim().length === 0) return;
  const resolved = versionPath || latestCliVersionPath();
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, version.trim(), "utf-8");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return !isProcessAlive(pid);
}

async function stopBridgeForTunnel(tunnelId: string): Promise<string | null> {
  const bridge = readBridgeProcessInfo(tunnelId);
  if (!bridge || !Number.isFinite(bridge.pid)) return null;
  if (!isProcessAlive(bridge.pid)) return null;

  try {
    process.kill(bridge.pid, "SIGTERM");
  } catch (error) {
    return `bridge ${bridge.pid}: failed to send SIGTERM (${error instanceof Error ? error.message : String(error)})`;
  }

  const stopped = await waitForProcessExit(bridge.pid, 6_000);
  if (!stopped) return `bridge ${bridge.pid}: did not exit after SIGTERM`;
  return null;
}

async function stopDaemonForTunnel(info: DaemonProcessInfo): Promise<string | null> {
  const pid = info.pid;
  if (!Number.isFinite(pid) || !isProcessAlive(pid)) return null;

  const socketPath = info.socketPath;
  if (socketPath) {
    try {
      await ipcCall(socketPath, { method: "close", params: {} });
    } catch (error) {
      // Fall back to SIGTERM to ensure strict cleanup before starting a new daemon.
      try {
        process.kill(pid, "SIGTERM");
      } catch (killError) {
        return `daemon ${pid}: IPC close failed (${error instanceof Error ? error.message : String(error)}); SIGTERM failed (${killError instanceof Error ? killError.message : String(killError)})`;
      }
    }
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      return `daemon ${pid}: no socketPath and SIGTERM failed (${error instanceof Error ? error.message : String(error)})`;
    }
  }

  const stopped = await waitForProcessExit(pid, 8_000);
  if (!stopped) return `daemon ${pid}: did not exit after stop request`;
  return null;
}

export async function stopOtherDaemons(exceptTunnelId?: string): Promise<void> {
  const dir = tunnelInfoDir();
  const entries = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".bridge.json"));
  const failures: string[] = [];

  for (const entry of entries) {
    const tunnelId = entry.replace(/\.json$/, "");
    if (exceptTunnelId && tunnelId === exceptTunnelId) continue;

    const bridgeError = await stopBridgeForTunnel(tunnelId);
    if (bridgeError) failures.push(`[${tunnelId}] ${bridgeError}`);

    const info = readDaemonProcessInfo(tunnelId);
    if (!info) continue;
    const daemonError = await stopDaemonForTunnel(info);
    if (daemonError) failures.push(`[${tunnelId}] ${daemonError}`);
  }

  if (failures.length > 0) {
    throw new Error(
      [
        "Critical: failed to stop previous tunnel daemon/bridge processes.",
        "Starting a new daemon now would leak resources and increase bandwidth usage.",
        ...failures,
      ].join("\n"),
    );
  }
}

export function stopBridgeProcess(tunnelId: string): void {
  const info = readBridgeProcessInfo(tunnelId);
  if (!info || !Number.isFinite(info.pid)) return;
  try {
    process.kill(info.pid, "SIGTERM");
  } catch {
    // already stopped
  }
}

export function buildBridgeForkStdio(logFd: number): ["ignore", number, number, "ipc"] {
  return ["ignore", logFd, logFd, "ipc"];
}

export function getFollowReadDelayMs(disconnected: boolean, consecutiveFailures: number): number {
  if (!disconnected) return 1_000;
  return Math.min(5_000, 1_000 * 2 ** Math.min(consecutiveFailures, 3));
}

export function resolveTunnelIdSelection(
  tunnelIdArg: string | undefined,
  tunnelOpt: string | undefined,
): string | undefined {
  return tunnelOpt || tunnelIdArg;
}

export function buildDaemonForkStdio(logFd: number): ["ignore", number, number, "ipc"] {
  return ["ignore", logFd, logFd, "ipc"];
}

export function parsePositiveIntegerOption(raw: string, optionName: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer. Received: ${raw}`);
  }
  return parsed;
}

export function parseBridgeMode(raw: string): BridgeMode {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "openclaw" || normalized === "none") {
    return normalized;
  }
  throw new Error(`--bridge must be one of: openclaw, none. Received: ${raw}`);
}

export function shouldRestartDaemonForCliUpgrade(
  daemonCliVersion: string | undefined,
  currentCliVersion: string,
): boolean {
  if (!daemonCliVersion || daemonCliVersion.trim().length === 0) return true;
  return daemonCliVersion.trim() !== currentCliVersion;
}

export function messageContainsPong(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const message = (payload as { msg?: unknown }).msg;
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  const data = (message as { data?: unknown }).data;
  return type === "text" && typeof data === "string" && data.trim().toLowerCase() === "pong";
}

export function getPublicTunnelUrl(tunnelId: string): string {
  const base = process.env.PUBBLUE_PUBLIC_URL || "https://pub.blue";
  return `${base.replace(/\/$/, "")}/t/${tunnelId}`;
}

export function pickReusableTunnel(
  tunnels: TunnelListItem[],
  nowMs = Date.now(),
): TunnelListItem | null {
  const active = tunnels
    .filter((t) => t.status === "active" && t.expiresAt > nowMs)
    .sort((a, b) => b.createdAt - a.createdAt);
  return active[0] ?? null;
}

export function readLogTail(logPath: string, maxChars = 4_000): string | null {
  if (!fs.existsSync(logPath)) return null;
  try {
    const content = fs.readFileSync(logPath, "utf-8");
    if (content.length <= maxChars) return content;
    return content.slice(-maxChars);
  } catch {
    return null;
  }
}

export function formatApiError(error: unknown): string {
  if (error instanceof TunnelApiError) {
    if (error.status === 429 && error.retryAfterSeconds !== undefined) {
      return `Rate limit exceeded. Retry after ${error.retryAfterSeconds}s.`;
    }
    return `${error.message} (HTTP ${error.status})`;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function cleanupCreatedTunnelOnStartFailure(
  apiClient: TunnelApiClient,
  target: DaemonStartTarget,
): Promise<void> {
  if (!target.createdNew) return;
  try {
    await apiClient.close(target.tunnelId);
  } catch (closeError) {
    console.error(
      `Failed to clean up newly created tunnel ${target.tunnelId}: ${formatApiError(closeError)}`,
    );
  }
}

export async function resolveActiveTunnel(): Promise<string> {
  const dir = tunnelInfoDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".bridge.json"));
  const active: string[] = [];
  for (const f of files) {
    const tunnelId = f.replace(".json", "");
    if (isDaemonRunning(tunnelId)) active.push(tunnelId);
  }
  if (active.length === 0) {
    failCli("No active tunnels. Run `pubblue tunnel start` first.");
  }
  if (active.length === 1) return active[0];
  failCli(`Multiple active tunnels: ${active.join(", ")}. Specify one.`);
}

export interface WaitForDaemonReadyParams {
  child: ChildProcess;
  infoPath: string;
  socketPath: string;
  timeoutMs: number;
}

export interface WaitForDaemonReadyResult {
  ok: boolean;
  reason?: string;
}

export function waitForDaemonReady({
  child,
  infoPath,
  socketPath,
  timeoutMs,
}: WaitForDaemonReadyParams): Promise<WaitForDaemonReadyResult> {
  return new Promise((resolve) => {
    let settled = false;
    let pollInFlight = false;
    let lastIpcError: string | null = null;

    const done = (result: WaitForDaemonReadyResult) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      child.off("exit", onExit);
      resolve(result);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      const suffix = signal ? ` (signal ${signal})` : "";
      done({ ok: false, reason: `daemon exited with code ${code ?? 0}${suffix}` });
    };

    child.on("exit", onExit);

    const poll = setInterval(() => {
      if (pollInFlight || !fs.existsSync(infoPath)) return;
      pollInFlight = true;
      void ipcCall(socketPath, { method: "status", params: {} })
        .then((status) => {
          if (status.ok) done({ ok: true });
        })
        .catch((error) => {
          lastIpcError = error instanceof Error ? error.message : String(error);
        })
        .finally(() => {
          pollInFlight = false;
        });
    }, 120);

    const timeout = setTimeout(() => {
      const reason = lastIpcError
        ? `timed out after ${timeoutMs}ms waiting for daemon readiness (last IPC error: ${lastIpcError})`
        : `timed out after ${timeoutMs}ms waiting for daemon readiness`;
      done({ ok: false, reason });
    }, timeoutMs);
  });
}

export async function waitForAgentOffer(params: {
  apiClient: TunnelApiClient;
  tunnelId: string;
  timeoutMs: number;
}): Promise<WaitForDaemonReadyResult> {
  const startedAt = Date.now();
  let lastError: string | null = null;

  while (Date.now() - startedAt < params.timeoutMs) {
    try {
      const tunnel = await params.apiClient.get(params.tunnelId);
      if (typeof tunnel.agentOffer === "string" && tunnel.agentOffer.length > 0) {
        return { ok: true };
      }
    } catch (error) {
      lastError = formatApiError(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return {
    ok: false,
    reason: lastError
      ? `agent offer was not published in time (last API error: ${lastError})`
      : "agent offer was not published in time",
  };
}

export interface EnsureBridgeReadyParams {
  bridgeMode: BridgeMode;
  tunnelId: string;
  socketPath: string;
  bridgeProcessEnv: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export async function ensureBridgeReady(
  params: EnsureBridgeReadyParams,
): Promise<WaitForDaemonReadyResult> {
  if (params.bridgeMode === "none") {
    return { ok: true };
  }

  const infoPath = bridgeInfoPath(params.tunnelId);
  if (isBridgeRunning(params.tunnelId)) {
    return waitForBridgeReady({
      infoPath,
      tunnelId: params.tunnelId,
      timeoutMs: params.timeoutMs,
    });
  }

  const bridgeScript = path.join(import.meta.dirname, "tunnel-bridge-entry.js");
  const logPath = bridgeLogPath(params.tunnelId);
  const logFd = fs.openSync(logPath, "a");
  const child = fork(bridgeScript, [], {
    detached: true,
    stdio: buildBridgeForkStdio(logFd),
    env: {
      ...params.bridgeProcessEnv,
      PUBBLUE_BRIDGE_MODE: params.bridgeMode,
      PUBBLUE_BRIDGE_TUNNEL_ID: params.tunnelId,
      PUBBLUE_BRIDGE_SOCKET: params.socketPath,
      PUBBLUE_BRIDGE_INFO: infoPath,
    },
  });
  fs.closeSync(logFd);
  if (child.connected) {
    child.disconnect();
  }
  child.unref();

  return waitForBridgeReady({
    child,
    infoPath,
    tunnelId: params.tunnelId,
    timeoutMs: params.timeoutMs,
  });
}

interface WaitForBridgeReadyParams {
  child?: ChildProcess;
  infoPath: string;
  tunnelId: string;
  timeoutMs: number;
}

function waitForBridgeReady({
  child,
  infoPath,
  tunnelId,
  timeoutMs,
}: WaitForBridgeReadyParams): Promise<WaitForDaemonReadyResult> {
  return new Promise((resolve) => {
    let settled = false;
    let lastState: string | undefined;
    let lastError: string | undefined;

    const done = (result: WaitForDaemonReadyResult) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      if (child) {
        child.off("exit", onExit);
      }
      resolve(result);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      const suffix = signal ? ` (signal ${signal})` : "";
      done({ ok: false, reason: `bridge exited with code ${code ?? 0}${suffix}` });
    };

    if (child) {
      child.on("exit", onExit);
    }

    const poll = setInterval(() => {
      if (!fs.existsSync(infoPath)) return;
      const info = readBridgeProcessInfo(tunnelId);
      if (!info) return;
      lastState = info.status;
      lastError = info.lastError;
      if (info.status === "ready" && isBridgeRunning(tunnelId)) {
        done({ ok: true });
        return;
      }
      if (info.status === "error") {
        done({
          ok: false,
          reason: info.lastError
            ? `bridge reported startup error: ${info.lastError}`
            : "bridge reported startup error",
        });
      }
    }, 120);

    const timeout = setTimeout(() => {
      const reason =
        lastError && lastError.length > 0
          ? `timed out after ${timeoutMs}ms waiting for bridge readiness (last error: ${lastError})`
          : `timed out after ${timeoutMs}ms waiting for bridge readiness (state: ${
              lastState || "unknown"
            })`;
      done({ ok: false, reason });
    }, timeoutMs);
  });
}
