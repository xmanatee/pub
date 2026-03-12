/**
 * Process and resource cleanup utilities for E2E tests.
 * Ensures no zombie daemons, stale sockets, or temp dirs survive test runs.
 */
import { execSync } from "node:child_process";
import { readdirSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Kill a process by PID with signal escalation: SIGTERM → wait → SIGKILL.
 * Returns true if the process was killed or already dead.
 */
export function killProcess(pid: number, timeoutMs = 5_000): boolean {
  if (!isProcessAlive(pid)) return true;

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return true;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    execSync("sleep 0.2");
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already dead
  }

  return !isProcessAlive(pid);
}

/** Check if a process is still alive. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Remove stale pub-agent socket files from /tmp. */
export function cleanupSocketFiles(): void {
  const tmp = tmpdir();
  try {
    const files = readdirSync(tmp);
    for (const f of files) {
      if (f.startsWith("pub-agent") && f.endsWith(".sock")) {
        try {
          unlinkSync(join(tmp, f));
        } catch {
          // Best effort
        }
      }
    }
  } catch {
    // /tmp not readable — unlikely but safe
  }
}

/** Remove stale pub-e2e-config temp dirs from /tmp. */
export function cleanupTempConfigDirs(): void {
  const tmp = tmpdir();
  try {
    const entries = readdirSync(tmp);
    for (const entry of entries) {
      if (entry.startsWith("pub-e2e-config-")) {
        try {
          rmSync(join(tmp, entry), { recursive: true, force: true });
        } catch {
          // Best effort
        }
      }
    }
  } catch {
    // Best effort
  }
}

/** Kill any stale pub daemon processes (safety net for crashed tests). */
export function killStaleDaemons(): void {
  try {
    const pids = execSync("pgrep -f 'pub-daemon\\|pub.*start.*--agent-name'", {
      encoding: "utf-8",
      timeout: 5_000,
    }).trim();

    for (const line of pids.split("\n")) {
      const pid = parseInt(line.trim(), 10);
      if (pid > 0) {
        killProcess(pid, 3_000);
      }
    }
  } catch {
    // No matching processes — expected when clean
  }
}
