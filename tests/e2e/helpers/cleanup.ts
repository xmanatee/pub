/**
 * Process and resource cleanup utilities for E2E tests.
 * Ensures no zombie daemons, stale sockets, or temp dirs survive test runs.
 */
import { readdirSync, rmSync } from "node:fs";
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
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already dead between check and kill
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

/** Remove stale pub-agent socket files from the system temp dir. */
export function cleanupSocketFiles(): void {
  const tmp = tmpdir();
  const files = readdirSync(tmp);
  for (const f of files) {
    if (f.startsWith("pub-agent") && f.endsWith(".sock")) {
      rmSync(join(tmp, f), { force: true });
    }
  }
}

/** Remove stale Pub E2E temp homes from /tmp. */
export function cleanupTempConfigDirs(): void {
  const tmp = tmpdir();
  const entries = readdirSync(tmp);
  for (const entry of entries) {
    if (entry.startsWith("pub-e2e-home-")) {
      rmSync(join(tmp, entry), { recursive: true, force: true });
    }
  }
}
