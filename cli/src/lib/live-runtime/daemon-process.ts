import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import { errorMessage } from "../cli-error.js";
import { getAgentSocketPath, ipcCall } from "../live-ipc.js";
import { liveInfoDir, liveInfoPath } from "./daemon-files.js";

interface DaemonProcessInfo {
  pid: number;
  socketPath?: string;
}

function hasErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function removeStaleDaemonInfo(infoPath: string): void {
  try {
    fs.unlinkSync(infoPath);
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT")) return;
    throw new Error(`Failed to clean up stale daemon info: ${errorMessage(error)}`);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readDaemonProcessInfo(slug: string): DaemonProcessInfo | null {
  const infoPath = liveInfoPath(slug);
  try {
    const info = JSON.parse(fs.readFileSync(infoPath, "utf-8")) as DaemonProcessInfo;
    if (!Number.isFinite(info.pid)) throw new Error("invalid daemon pid");
    if (!isProcessAlive(info.pid)) throw new Error("process not alive");
    return info;
  } catch (error) {
    if (!hasErrnoCode(error, "ENOENT")) {
      removeStaleDaemonInfo(infoPath);
    }
    return null;
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

export function isDaemonRunning(slug: string): boolean {
  return readDaemonProcessInfo(slug) !== null;
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

export function buildDaemonForkStdio(logFd: number): ["ignore", number, number, "ipc"] {
  return ["ignore", logFd, logFd, "ipc"];
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

export async function resolveActiveSlug(): Promise<string> {
  const socketPath = getAgentSocketPath();
  const response = await ipcCall(socketPath, { method: "active-slug", params: {} });
  if (response.ok && typeof response.slug === "string" && response.slug.length > 0) {
    return response.slug;
  }
  throw new Error("Daemon is running but no live is active. Wait for browser to initiate live.");
}
