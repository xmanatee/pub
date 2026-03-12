/**
 * CLI fixture for E2E tests.
 * Manages the `pub` CLI daemon lifecycle, config, and commands.
 *
 * Cleanup strategy:
 *  1. Try `pub stop` (graceful IPC shutdown)
 *  2. If daemon PID is tracked, SIGTERM → wait → SIGKILL
 *  3. Remove socket file
 *  4. Remove temp config dir
 */
import { execFileSync, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { killProcess } from "../helpers/cleanup";
import type { TestUser } from "./convex";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLI_BUILD_DIR = resolve(__dirname, "../../../cli");
const MOCK_BRIDGE_PATH = resolve(__dirname, "mock-bridge.sh");

interface CliConfig {
  core: { apiKey: string; baseUrl: string };
  bridge: {
    mode: string;
    openclawLikeCommand: string;
    verbose: boolean;
  };
}

interface DaemonInfo {
  pid: number;
  socketPath: string;
  logPath: string;
}

export class CliFixture {
  private configDir: string;
  private cliBin: string;
  private user: TestUser;
  private convexSiteUrl: string;
  private daemonPid: number | null = null;
  private socketPath: string | null = null;

  constructor(user: TestUser, convexSiteUrl: string) {
    this.user = user;
    this.convexSiteUrl = convexSiteUrl;
    this.configDir = mkdtempSync(join(tmpdir(), "pub-e2e-config-"));
    this.cliBin = getCliBinaryPath();
    this.writeConfig();
  }

  private writeConfig(): void {
    const config: CliConfig = {
      core: {
        apiKey: this.user.apiKey,
        baseUrl: this.convexSiteUrl,
      },
      bridge: {
        mode: "openclaw-like",
        openclawLikeCommand: MOCK_BRIDGE_PATH,
        verbose: true,
      },
    };
    writeFileSync(join(this.configDir, "config.json"), JSON.stringify(config, null, 2));
  }

  private env(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PUB_CONFIG_DIR: this.configDir,
      PUB_API_KEY: this.user.apiKey,
      PUB_BASE_URL: this.convexSiteUrl,
      PUB_SKIP_UPDATE_CHECK: "1",
      PUB_CLI_BIN: this.cliBin,
    };
  }

  /** Run a CLI command synchronously. Returns stdout. */
  run(args: string[], timeoutMs = 30_000): string {
    return execFileSync(this.cliBin, args, {
      encoding: "utf-8",
      timeout: timeoutMs,
      env: this.env(),
      cwd: this.configDir,
    }).trim();
  }

  /** Start the daemon in the background. Waits for it to be ready. */
  async startDaemon(agentName = "e2e-agent"): Promise<void> {
    const child = spawn(this.cliBin, ["start", "--agent-name", agentName], {
      env: this.env(),
      cwd: this.configDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    await new Promise<void>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pub start exited ${code}: ${stderr || stdout}`));
      });
      child.on("error", reject);
    });

    // Read daemon info file to track PID and socket
    this.readDaemonInfo();

    // Verify daemon is actually running
    await this.waitForStatus("connected", 30_000);
  }

  /** Read daemon info from the info file written by the daemon process. */
  private readDaemonInfo(): void {
    const infoPath = join(this.configDir, "lives", "agent.json");
    try {
      const raw = readFileSync(infoPath, "utf-8");
      const info: DaemonInfo = JSON.parse(raw);
      this.daemonPid = info.pid;
      this.socketPath = info.socketPath;
    } catch {
      // Info file not found — daemon may use a different path
    }
  }

  /** Wait for daemon status to show a specific connection state. */
  async waitForStatus(
    expectedField: "connected" | "signalingConnected",
    timeoutMs = 15_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const status = this.getStatus();
        if (expectedField === "connected" || status.includes(expectedField)) {
          return;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }

  /** Get daemon status as raw string. */
  getStatus(): string {
    return this.run(["status"]);
  }

  /** Send a message via the CLI write command. */
  write(message: string, channel?: string): string {
    const args = ["write", message];
    if (channel) args.push("-c", channel);
    return this.run(args);
  }

  /** Stop the daemon gracefully via CLI. */
  stop(): void {
    try {
      this.run(["stop"], 15_000);
    } catch {
      // Daemon might already be stopped
    }
  }

  /** Force-kill the daemon process if still alive. */
  private forceKill(): void {
    if (this.daemonPid && this.daemonPid > 0) {
      killProcess(this.daemonPid, 5_000);
    }
  }

  /**
   * Full cleanup: stop daemon, force-kill if needed, remove socket and config.
   * Safe to call multiple times. Safe to call after test failures.
   */
  cleanup(): void {
    // 1. Try graceful stop
    this.stop();

    // 2. Force-kill if still alive
    this.forceKill();

    // 3. Clean up socket file
    if (this.socketPath) {
      try {
        if (existsSync(this.socketPath)) rmSync(this.socketPath);
      } catch {
        // Best effort
      }
    }

    // 4. Remove temp config dir
    try {
      rmSync(this.configDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }
}

/** Resolve the CLI binary path. */
function getCliBinaryPath(): string {
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const binName = `pub-${platform}-${arch}`;
  const binPath = join(CLI_BUILD_DIR, "dist-bin", binName);

  if (!existsSync(binPath)) {
    throw new Error(`CLI binary not found at ${binPath}. Run 'cd cli && pnpm build' first.`);
  }

  return binPath;
}

/** Build the CLI binary. Call during global setup. */
export function buildCli(): void {
  if (!existsSync(CLI_BUILD_DIR)) {
    throw new Error(`CLI directory not found at ${CLI_BUILD_DIR}`);
  }
  execSync("pnpm build", {
    cwd: CLI_BUILD_DIR,
    encoding: "utf-8",
    timeout: 120_000,
    stdio: "inherit",
  });
}
