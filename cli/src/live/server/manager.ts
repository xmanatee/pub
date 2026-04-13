import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { waitForPort } from "./port.js";

const PORT_READY_TIMEOUT_MS = 60_000;
const TERM_GRACE_MS = 5_000;

export interface DevServerConfig {
  devCommand: string;
  devCwd?: string;
  devPort: number;
  tunnelBase?: string;
}

export interface DevServer {
  pid: number;
  port: number;
  ready: Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Send `signal` to the child's full process group (POSIX) or the whole tree
 * (Windows). On POSIX this requires the child to have been spawned with
 * `detached: true`, which puts it in its own process group rooted at the
 * child's pid. We never kill by single pid: dev servers fork helpers (esbuild
 * workers, Vite plugin workers) that would otherwise be orphaned.
 *
 * ESRCH (group already gone) is the success case for a "kill if alive"
 * caller and is swallowed; all other errors propagate.
 */
export function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    throw error;
  }
}

function parseDevCommand(command: string): { cmd: string; args: string[] } {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Invalid dev command (empty): "${command}"`);
  }
  return { cmd: parts[0], args: parts.slice(1) };
}

export function startDevServer(config: DevServerConfig, logPath?: string): DevServer {
  const { cmd, args } = parseDevCommand(config.devCommand);
  const logStream = logPath ? fs.createWriteStream(logPath, { flags: "a" }) : null;

  const child = spawn(cmd, args, {
    cwd: config.devCwd,
    stdio: ["ignore", logStream ? "pipe" : "inherit", logStream ? "pipe" : "inherit"],
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      PORT: String(config.devPort),
      ...(config.tunnelBase ? { TUNNEL_BASE: config.tunnelBase } : {}),
    },
  });

  if (typeof child.pid !== "number") {
    throw new Error(`Failed to spawn dev server "${config.devCommand}"`);
  }
  const pid = child.pid;

  if (logStream) {
    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);
  }

  const ready = waitForPort(config.devPort, PORT_READY_TIMEOUT_MS);

  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    if (stopping) return stopping;
    stopping = new Promise((resolve) => {
      if (child.exitCode !== null) {
        logStream?.end();
        resolve();
        return;
      }

      const forceKillTimer = setTimeout(() => {
        killProcessGroup(pid, "SIGKILL");
      }, TERM_GRACE_MS);

      child.once("exit", () => {
        clearTimeout(forceKillTimer);
        logStream?.end();
        resolve();
      });

      killProcessGroup(pid, "SIGTERM");
    });
    return stopping;
  };

  return { pid, port: config.devPort, ready, stop };
}
