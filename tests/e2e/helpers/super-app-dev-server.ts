/**
 * Super-app dev server fixture for full-stack E2E tests.
 *
 * Spawns `vite dev` against an isolated HOME (config + JSON stores go there)
 * and PUB_AGENT_SOCKET (server fns dispatch to the test daemon). Waits for the
 * "Local: http://…" line so callers can `page.goto(url)` immediately.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { killProcess } from "./cleanup";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPER_APP_DIR = resolve(__dirname, "../../../packages/super-app");
const VITE_BIN = resolve(SUPER_APP_DIR, "node_modules/.bin/vite");

export interface SuperAppDevServerOptions {
  /** Forwarded to the super-app process. Server fns dial this socket. */
  agentSocketPath: string;
  /** Optional `{ feature: … }` written to `<home>/.pub-super-app/config.json`. */
  config?: Record<string, unknown>;
}

function pickFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolvePort(port));
      } else {
        reject(new Error("could not determine free port"));
      }
    });
  });
}

export class SuperAppDevServer {
  private child: ChildProcess | null = null;
  readonly home: string;
  url = "";

  constructor(private readonly opts: SuperAppDevServerOptions) {
    this.home = mkdtempSync(join(tmpdir(), "pub-super-app-home-"));
  }

  async start(): Promise<string> {
    const configDir = join(this.home, ".pub-super-app");
    mkdirSync(configDir, { recursive: true });
    if (this.opts.config) {
      writeFileSync(join(configDir, "config.json"), JSON.stringify(this.opts.config, null, 2));
    }
    const port = await pickFreePort();
    const url = `http://127.0.0.1:${port}`;
    this.child = spawn(
      VITE_BIN,
      ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      {
        cwd: SUPER_APP_DIR,
        env: {
          ...process.env,
          HOME: this.home,
          PUB_AGENT_SOCKET: this.opts.agentSocketPath,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const reader = this.captureOutput();
    await this.waitForHttp(url, reader);
    this.url = url;
    return url;
  }

  private captureOutput(): () => string {
    let stdout = "";
    let stderr = "";
    this.child?.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    this.child?.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    return () => `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`;
  }

  private async waitForHttp(
    url: string,
    getOutput: () => string,
    timeoutMs = 90_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.child || this.child.exitCode !== null) {
        throw new Error(`vite dev exited before ready\n${getOutput()}`);
      }
      try {
        const res = await fetch(url);
        if (res.ok) return;
      } catch {
        // still starting
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`vite dev not reachable at ${url} within ${timeoutMs}ms\n${getOutput()}`);
  }

  async cleanup(): Promise<void> {
    if (this.child?.pid) killProcess(this.child.pid, 5_000);
    rmSync(this.home, { recursive: true, force: true });
  }
}
