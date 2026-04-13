import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import { errorMessage } from "../../core/errors/cli-error.js";
import { killProcessGroup } from "../server/manager.js";
import { DaemonUnavailableError, ipcCall } from "../transport/ipc.js";
import { liveInfoDir, liveInfoPath } from "./daemon-files.js";

interface DaemonProcessInfo {
  pid: number;
  socketPath?: string;
  devServerPid?: number;
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
  } catch (error) {
    if (hasErrnoCode(error, "ESRCH")) return false;
    if (hasErrnoCode(error, "EPERM")) return true;
    throw new Error(`Failed to check process ${pid}: ${errorMessage(error)}`);
  }
}

function readDaemonProcessInfo(daemonId: string): DaemonProcessInfo | null {
  const infoPath = liveInfoPath(daemonId);
  let raw: string;
  try {
    raw = fs.readFileSync(infoPath, "utf-8");
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT")) return null;
    throw new Error(`Failed to read daemon info at ${infoPath}: ${errorMessage(error)}`);
  }

  let info: DaemonProcessInfo;
  try {
    info = JSON.parse(raw) as DaemonProcessInfo;
  } catch (error) {
    removeStaleDaemonInfo(infoPath);
    throw new Error(`Invalid daemon info JSON at ${infoPath}: ${errorMessage(error)}`);
  }

  if (!Number.isFinite(info.pid)) {
    removeStaleDaemonInfo(infoPath);
    return null;
  }

  try {
    if (!isProcessAlive(info.pid)) {
      removeStaleDaemonInfo(infoPath);
      return null;
    }
    return info;
  } catch (error) {
    throw new Error(`Failed to inspect daemon process ${info.pid}: ${errorMessage(error)}`);
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

function reapDevServerGroup(pid: number | undefined): void {
  if (typeof pid !== "number") return;
  killProcessGroup(pid, "SIGKILL");
}

async function requestDaemonStop(
  pid: number,
  socketPath: string | undefined,
): Promise<string | null> {
  if (socketPath) {
    try {
      await ipcCall(socketPath, { method: "close", params: {} });
      return null;
    } catch (error) {
      // Socket gone or refused means the recorded pid is no longer our daemon.
      // Do not escalate to SIGTERM — that pid may have been reused by an
      // unrelated process.
      if (error instanceof DaemonUnavailableError) return "stale";
      // IPC reached a live daemon that refused; fall through to SIGTERM.
    }
  }
  try {
    process.kill(pid, "SIGTERM");
    return null;
  } catch (error) {
    return `daemon ${pid}: SIGTERM failed (${errorMessage(error)})`;
  }
}

async function stopRecordedDaemon(info: DaemonProcessInfo): Promise<string | null> {
  if (!isProcessAlive(info.pid)) {
    // Daemon is dead; dev-server group may have outlived it (SIGKILL bypasses
    // the daemon's exit handler).
    reapDevServerGroup(info.devServerPid);
    return null;
  }

  const outcome = await requestDaemonStop(info.pid, info.socketPath);
  if (outcome === "stale") {
    reapDevServerGroup(info.devServerPid);
    return null;
  }
  if (outcome !== null) return outcome;

  const stopped = await waitForProcessExit(info.pid, 8_000);
  if (!stopped) return `daemon ${info.pid}: did not exit after stop request`;
  reapDevServerGroup(info.devServerPid);
  return null;
}

export async function stopRecordedDaemons(): Promise<number> {
  const dir = liveInfoDir();
  const entries = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  const failures: string[] = [];
  let stoppedCount = 0;

  for (const entry of entries) {
    const daemonId = entry.replace(/\.json$/, "");
    const info = readDaemonProcessInfo(daemonId);
    if (!info) continue;
    const daemonError = await stopRecordedDaemon(info);
    if (daemonError) {
      failures.push(`[${daemonId}] ${daemonError}`);
      continue;
    }
    stoppedCount += 1;
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

  return stoppedCount;
}

export function buildDaemonSpawnStdio(logFd: number): ["ignore", number, number] {
  return ["ignore", logFd, logFd];
}

interface WaitForDaemonReadyParams {
  child: ChildProcess;
  infoPath: string;
  socketPath: string;
  timeoutMs: number;
  failOnChildExit?: boolean;
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
  failOnChildExit = true,
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
      if (failOnChildExit) {
        child.off("exit", onExit);
      }
      resolve(result);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      const suffix = signal ? ` (signal ${signal})` : "";
      done({ ok: false, reason: `daemon exited with code ${code ?? 0}${suffix}` });
    };

    if (failOnChildExit) {
      child.on("exit", onExit);
    }

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
