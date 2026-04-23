import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DevServer, startDevServer } from "./manager.js";

const isPosix = process.platform !== "win32";
let nextTestPort = 39_000 + (process.pid % 1_000) * 10;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processGroupId(pid: number): number | null {
  if (!isPosix) return null;
  const { stdout, status } = spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], {
    encoding: "utf-8",
  });
  if (status !== 0) return null;
  const value = Number.parseInt(stdout.trim(), 10);
  return Number.isInteger(value) ? value : null;
}

function descendantPids(rootPid: number): number[] {
  if (!isPosix) return [];
  const { stdout, status } = spawnSync("pgrep", ["-P", String(rootPid)], {
    encoding: "utf-8",
  });
  if (status !== 0) return [];
  return stdout
    .split("\n")
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((n) => Number.isInteger(n));
}

function nextUnusedTestPort(): number {
  const port = nextTestPort;
  nextTestPort += 1;
  return port;
}

// Test scripts never bind the port; absorb the dangling waitForPort rejection.
function suppressReadyRejection(dev: DevServer): void {
  dev.ready.catch(() => {});
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return predicate();
}

describe("startDevServer", () => {
  let scriptDir: string;

  beforeEach(() => {
    scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-devserver-test-"));
  });

  afterEach(() => {
    fs.rmSync(scriptDir, { recursive: true, force: true });
  });

  it.skipIf(!isPosix)("spawns the dev server in its own process group", async () => {
    const port = nextUnusedTestPort();
    const script = path.join(scriptDir, "noop.sh");
    fs.writeFileSync(script, "#!/bin/sh\nsleep 60\n", { mode: 0o755 });

    const dev = startDevServer({ devCommand: script, devPort: port });
    suppressReadyRejection(dev);
    try {
      await waitFor(() => isAlive(dev.pid), 2_000);
      expect(isAlive(dev.pid)).toBe(true);
      const pgid = processGroupId(dev.pid);
      if (pgid !== null) {
        expect(pgid).toBe(dev.pid);
      }
    } finally {
      await dev.stop();
    }
  });

  it.skipIf(!isPosix)("kills the entire process tree on stop()", async () => {
    const port = nextUnusedTestPort();
    const parentScript = path.join(scriptDir, "parent.sh");
    fs.writeFileSync(
      parentScript,
      "#!/bin/sh\n( sleep 60 ) &\nCHILD_PID=$!\necho $CHILD_PID > " +
        path.join(scriptDir, "child.pid") +
        "\nwait $CHILD_PID\n",
      { mode: 0o755 },
    );

    const dev = startDevServer({ devCommand: parentScript, devPort: port });
    suppressReadyRejection(dev);
    const childPidFile = path.join(scriptDir, "child.pid");
    await waitFor(() => fs.existsSync(childPidFile), 2_000);
    const childPid = Number.parseInt(fs.readFileSync(childPidFile, "utf-8").trim(), 10);
    expect(Number.isInteger(childPid)).toBe(true);
    expect(isAlive(childPid)).toBe(true);

    await dev.stop();

    const reaped = await waitFor(() => !isAlive(childPid), 6_000);
    expect(reaped).toBe(true);
    expect(isAlive(dev.pid)).toBe(false);
  });

  it.skipIf(!isPosix)(
    "killing the parent reaps grandchildren via process-group SIGKILL",
    async () => {
      const port = nextUnusedTestPort();
      const parentScript = path.join(scriptDir, "parent.sh");
      const grandchildPidFile = path.join(scriptDir, "grandchild.pid");
      fs.writeFileSync(
        parentScript,
        `#!/bin/sh
sh -c '( sleep 60 ) & echo $! > "${grandchildPidFile}"; wait' &
wait
`,
        { mode: 0o755 },
      );

      const dev = startDevServer({ devCommand: parentScript, devPort: port });
      suppressReadyRejection(dev);
      await waitFor(() => fs.existsSync(grandchildPidFile), 2_000);
      const grandchildPid = Number.parseInt(fs.readFileSync(grandchildPidFile, "utf-8").trim(), 10);
      expect(isAlive(grandchildPid)).toBe(true);

      await dev.stop();

      const reaped = await waitFor(() => !isAlive(grandchildPid), 8_000);
      expect(reaped).toBe(true);
      expect(descendantPids(dev.pid)).toEqual([]);
    },
  );

  it("rejects empty dev commands", () => {
    expect(() => startDevServer({ devCommand: "   ", devPort: 1 })).toThrow(/empty/i);
  });
});
