import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { type Pub, PubApiClient, PubApiError } from "../lib/api.js";
import { failCli } from "../lib/cli-error.js";
import type { BridgeConfig, Config } from "../lib/config.js";
import { getConfig } from "../lib/config.js";
import type { BridgeMode } from "../lib/tunnel-daemon-shared.js";
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

export interface DaemonProcessInfo {
  cliVersion?: string;
  pid: number;
  slug: string;
  socketPath?: string;
  startedAt?: number;
}

export interface DaemonStartTarget {
  createdNew: boolean;
  expiresAt: number;
  mode: "created" | "existing";
  slug: string;
  url: string;
}

export function liveInfoDir(): string {
  const dir = path.join(
    process.env.HOME || process.env.USERPROFILE || "/tmp",
    ".config",
    "pubblue",
    "lives",
  );
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function liveInfoPath(slug: string): string {
  return path.join(liveInfoDir(), `${slug}.json`);
}

export function liveLogPath(slug: string): string {
  return path.join(liveInfoDir(), `${slug}.log`);
}

export function createApiClient(configOverride?: Config): PubApiClient {
  const config = configOverride || getConfig();
  return new PubApiClient(config.baseUrl, config.apiKey);
}

export function buildBridgeProcessEnv(bridgeConfig?: BridgeConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  const setIfMissing = (key: string, value: string | number | boolean | undefined) => {
    if (value === undefined || value === null) return;
    const current = env[key];
    if (typeof current === "string" && current.length > 0) return;
    env[key] = String(value);
  };

  setIfMissing("PUBBLUE_PROJECT_ROOT", process.cwd());

  if (!bridgeConfig) return env;

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

export function isDaemonRunning(slug: string): boolean {
  return readDaemonProcessInfo(slug) !== null;
}

export function readDaemonProcessInfo(slug: string): DaemonProcessInfo | null {
  const infoPath = liveInfoPath(slug);
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

export function latestCliVersionPath(): string {
  return path.join(liveInfoDir(), "cli-version.txt");
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

export async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return !isProcessAlive(pid);
}

async function stopDaemonForLive(info: DaemonProcessInfo): Promise<string | null> {
  const pid = info.pid;
  if (!Number.isFinite(pid) || !isProcessAlive(pid)) return null;

  const socketPath = info.socketPath;
  if (socketPath) {
    try {
      await ipcCall(socketPath, { method: "close", params: {} });
    } catch (error) {
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

export async function stopOtherDaemons(exceptSlug?: string): Promise<void> {
  const dir = liveInfoDir();
  const entries = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  const failures: string[] = [];

  for (const entry of entries) {
    const slug = entry.replace(/\.json$/, "");
    if (exceptSlug && slug === exceptSlug) continue;

    const info = readDaemonProcessInfo(slug);
    if (!info) continue;
    const daemonError = await stopDaemonForLive(info);
    if (daemonError) failures.push(`[${slug}] ${daemonError}`);
  }

  if (failures.length > 0) {
    throw new Error(
      [
        "Critical: failed to stop previous live daemon/bridge processes.",
        "Starting a new daemon now would leak resources and increase bandwidth usage.",
        ...failures,
      ].join("\n"),
    );
  }
}

export function getFollowReadDelayMs(disconnected: boolean, consecutiveFailures: number): number {
  if (!disconnected) return 1_000;
  return Math.min(5_000, 1_000 * 2 ** Math.min(consecutiveFailures, 3));
}

export function resolveSlugSelection(
  slugArg: string | undefined,
  slugOpt: string | undefined,
): string | undefined {
  return slugOpt || slugArg;
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

export function resolveBridgeMode(opts: { bridge?: string; foreground?: boolean }): BridgeMode {
  return parseBridgeMode(opts.bridge || (opts.foreground ? "none" : "openclaw"));
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

export function getPublicUrl(slug: string): string {
  const base = process.env.PUBBLUE_PUBLIC_URL || "https://pub.blue";
  return `${base.replace(/\/$/, "")}/p/${slug}`;
}

export function pickReusableLive(pubs: Pub[], nowMs = Date.now()): Pub | null {
  const active = pubs
    .filter((p) => p.live?.status === "active" && p.live.expiresAt > nowMs)
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
  if (error instanceof PubApiError) {
    if (error.status === 429 && error.retryAfterSeconds !== undefined) {
      return `Rate limit exceeded. Retry after ${error.retryAfterSeconds}s.`;
    }
    return `${error.message} (HTTP ${error.status})`;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function cleanupLiveOnStartFailure(
  apiClient: PubApiClient,
  target: DaemonStartTarget,
): Promise<void> {
  if (!target.createdNew) return;
  try {
    await apiClient.closeLive(target.slug);
  } catch (closeError) {
    console.error(`Failed to clean up live for ${target.slug}: ${formatApiError(closeError)}`);
  }
}

export async function resolveActiveSlug(): Promise<string> {
  const dir = liveInfoDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const active: string[] = [];
  for (const f of files) {
    const slug = f.replace(".json", "");
    if (isDaemonRunning(slug)) active.push(slug);
  }
  if (active.length === 0) {
    failCli("No active lives. Run `pubblue open <slug>` first.");
  }
  if (active.length === 1) return active[0];
  failCli(`Multiple active lives: ${active.join(", ")}. Specify one with --slug.`);
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
  apiClient: PubApiClient;
  slug: string;
  timeoutMs: number;
}): Promise<WaitForDaemonReadyResult> {
  const startedAt = Date.now();
  let lastError: string | null = null;

  while (Date.now() - startedAt < params.timeoutMs) {
    try {
      const session = await params.apiClient.getLive(params.slug);
      if (typeof session.agentOffer === "string" && session.agentOffer.length > 0) {
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
