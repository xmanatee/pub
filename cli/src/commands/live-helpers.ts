import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { PubApiError } from "../lib/api.js";
import { failCli } from "../lib/cli-error.js";
import type { BridgeConfig } from "../lib/config.js";
import type { BridgeMode } from "../lib/live-daemon-shared.js";
import { getAgentSocketPath, ipcCall } from "../lib/live-ipc.js";

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

const MIME_BY_EXT: Record<string, string> = {
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
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".ts": "text/typescript; charset=utf-8",
  ".tsx": "text/typescript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".scss": "text/x-scss; charset=utf-8",
  ".sass": "text/x-sass; charset=utf-8",
  ".less": "text/x-less; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
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

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface DaemonProcessInfo {
  cliVersion?: string;
  pid: number;
  socketPath?: string;
  startedAt?: number;
}

function liveInfoDir(): string {
  const dir = path.join(homedir(), ".config", "pubblue", "lives");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function liveInfoPath(slug: string): string {
  return path.join(liveInfoDir(), `${slug}.json`);
}

export function liveLogPath(slug: string): string {
  return path.join(liveInfoDir(), `${slug}.log`);
}

export function buildBridgeProcessEnv(bridgeConfig?: BridgeConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  const setIfMissing = (key: string, value: string | number | boolean | undefined) => {
    if (value === undefined) return;
    const current = env[key];
    if (typeof current === "string" && current.length > 0) return;
    env[key] = String(value);
  };

  setIfMissing("PUBBLUE_PROJECT_ROOT", process.cwd());
  setIfMissing("OPENCLAW_HOME", homedir());

  if (!bridgeConfig) return env;

  setIfMissing("OPENCLAW_PATH", bridgeConfig.openclawPath);
  setIfMissing("OPENCLAW_SESSION_ID", bridgeConfig.sessionId);
  setIfMissing("OPENCLAW_THREAD_ID", bridgeConfig.threadId);
  setIfMissing("OPENCLAW_CANVAS_REMINDER_EVERY", bridgeConfig.canvasReminderEvery);
  setIfMissing(
    "OPENCLAW_DELIVER",
    bridgeConfig.deliver === undefined ? undefined : bridgeConfig.deliver ? "1" : "0",
  );
  setIfMissing("OPENCLAW_DELIVER_CHANNEL", bridgeConfig.deliverChannel);
  setIfMissing("OPENCLAW_REPLY_TO", bridgeConfig.replyTo);
  setIfMissing("OPENCLAW_DELIVER_TIMEOUT_MS", bridgeConfig.deliverTimeoutMs);
  setIfMissing("OPENCLAW_ATTACHMENT_DIR", bridgeConfig.attachmentDir);
  setIfMissing("OPENCLAW_ATTACHMENT_MAX_BYTES", bridgeConfig.attachmentMaxBytes);
  return env;
}

export async function ensureNodeDatachannelAvailable(): Promise<void> {
  try {
    await import("node-datachannel");
  } catch (error) {
    failCli(
      [
        "node-datachannel native module is not available.",
        "Run `pnpm rebuild node-datachannel` in the cli package and retry.",
        `Details: ${errorMessage(error)}`,
      ].join("\n"),
    );
  }
}

export function isDaemonRunning(slug: string): boolean {
  return readDaemonProcessInfo(slug) !== null;
}

function readDaemonProcessInfo(slug: string): DaemonProcessInfo | null {
  const infoPath = liveInfoPath(slug);
  try {
    const info = JSON.parse(fs.readFileSync(infoPath, "utf-8")) as DaemonProcessInfo;
    if (!Number.isFinite(info.pid)) throw new Error("invalid daemon pid");
    if (!isProcessAlive(info.pid)) throw new Error("process not alive");
    return info;
  } catch {
    try {
      fs.unlinkSync(infoPath);
    } catch {}
    return null;
  }
}

export function latestCliVersionPath(): string {
  return path.join(liveInfoDir(), "cli-version.txt");
}

export function readLatestCliVersion(versionPath?: string): string | null {
  const resolved = versionPath || latestCliVersionPath();
  try {
    const value = fs.readFileSync(resolved, "utf-8").trim();
    return value.length === 0 ? null : value;
  } catch {
    return null;
  }
}

export function writeLatestCliVersion(version: string, versionPath?: string): void {
  const trimmed = version.trim();
  if (trimmed.length === 0) return;
  const resolved = versionPath || latestCliVersionPath();
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, trimmed, "utf-8");
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

async function stopDaemonForLive(info: DaemonProcessInfo): Promise<string | null> {
  const pid = info.pid;
  if (!isProcessAlive(pid)) return null;

  const socketPath = info.socketPath;
  if (socketPath) {
    try {
      await ipcCall(socketPath, { method: "close", params: {} });
    } catch (error) {
      try {
        process.kill(pid, "SIGTERM");
      } catch (killError) {
        return `daemon ${pid}: IPC close failed (${errorMessage(error)}); SIGTERM failed (${errorMessage(killError)})`;
      }
    }
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      return `daemon ${pid}: no socketPath and SIGTERM failed (${errorMessage(error)})`;
    }
  }

  const stopped = await waitForProcessExit(pid, 8_000);
  if (!stopped) return `daemon ${pid}: did not exit after stop request`;
  return null;
}

export async function stopOtherDaemons(): Promise<void> {
  const dir = liveInfoDir();
  const entries = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  const failures: string[] = [];

  for (const entry of entries) {
    const slug = entry.replace(/\.json$/, "");
    const info = readDaemonProcessInfo(slug);
    if (!info) continue;
    const daemonError = await stopDaemonForLive(info);
    if (daemonError) failures.push(`[${slug}] ${daemonError}`);
  }

  if (failures.length > 0) {
    throw new Error(
      [
        "Critical: failed to stop previous live daemon processes.",
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

export function messageContainsPong(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const message = (payload as { msg?: unknown }).msg;
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  const data = (message as { data?: unknown }).data;
  return type === "text" && typeof data === "string" && data.trim().toLowerCase() === "pong";
}

export function readLogTail(logPath: string, maxChars = 4_000): string | null {
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
  return errorMessage(error);
}

export async function resolveActiveSlug(): Promise<string> {
  const socketPath = getAgentSocketPath();
  let response: Record<string, unknown>;
  try {
    response = await ipcCall(socketPath, { method: "active-slug", params: {} });
  } catch {
    failCli("No active daemon. Run `pubblue start` first.");
  }
  if (response.ok && typeof response.slug === "string" && response.slug.length > 0) {
    return response.slug;
  }
  failCli("Daemon is running but no live is active. Wait for browser to initiate live.");
}

interface WaitForDaemonReadyParams {
  child: ChildProcess;
  infoPath: string;
  socketPath: string;
  timeoutMs: number;
}

interface WaitForDaemonReadyResult {
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
          lastIpcError = errorMessage(error);
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
