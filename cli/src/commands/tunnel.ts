import type { ChildProcess } from "node:child_process";
import { fork } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Command } from "commander";
import { type BridgeMessage, CHANNELS, generateMessageId } from "../lib/bridge-protocol.js";
import { getConfig } from "../lib/config.js";
import { TunnelApiClient } from "../lib/tunnel-api.js";
import { getSocketPath, ipcCall } from "../lib/tunnel-ipc.js";

const TEXT_FILE_EXTENSIONS = new Set([
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

function getMimeType(filePath: string): string {
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

function tunnelInfoDir(): string {
  const dir = path.join(
    process.env.HOME || process.env.USERPROFILE || "/tmp",
    ".config",
    "pubblue",
    "tunnels",
  );
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function tunnelInfoPath(tunnelId: string): string {
  return path.join(tunnelInfoDir(), `${tunnelId}.json`);
}

function createApiClient(): TunnelApiClient {
  const config = getConfig();
  return new TunnelApiClient(config.baseUrl, config.apiKey);
}

async function ensureNodeDatachannelAvailable(): Promise<void> {
  try {
    await import("node-datachannel");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("node-datachannel native module is not available.");
    console.error("Run `pnpm rebuild node-datachannel` in the cli package and retry.");
    console.error(`Details: ${message}`);
    process.exit(1);
  }
}

function isDaemonRunning(tunnelId: string): boolean {
  const infoPath = tunnelInfoPath(tunnelId);
  if (!fs.existsSync(infoPath)) return false;
  try {
    const info = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
    process.kill(info.pid, 0); // Check if process exists
    return true;
  } catch {
    // Clean up stale info file
    try {
      fs.unlinkSync(infoPath);
    } catch {
      /* ok */
    }
    return false;
  }
}

export function getFollowReadDelayMs(disconnected: boolean, consecutiveFailures: number): number {
  if (!disconnected) return 1_000;
  return Math.min(5_000, 1_000 * 2 ** Math.min(consecutiveFailures, 3));
}

export function resolveTunnelIdSelection(
  tunnelIdArg: string | undefined,
  tunnelOpt: string | undefined,
): string | undefined {
  return tunnelOpt || tunnelIdArg;
}

export function registerTunnelCommands(program: Command): void {
  const tunnel = program.command("tunnel").description("P2P encrypted tunnel to browser");

  tunnel
    .command("start")
    .description("Start a new tunnel (spawns background daemon)")
    .option("--expires <duration>", "Auto-close after duration (e.g. 4h, 1d)", "24h")
    .option("--foreground", "Run in foreground (don't fork)")
    .action(async (opts: { expires: string; foreground?: boolean }) => {
      await ensureNodeDatachannelAvailable();
      const apiClient = createApiClient();

      const result = await apiClient.create({
        expiresIn: opts.expires,
      });

      const socketPath = getSocketPath(result.tunnelId);
      const infoPath = tunnelInfoPath(result.tunnelId);

      if (opts.foreground) {
        const { startDaemon } = await import("../lib/tunnel-daemon.js");
        console.log(`Tunnel started: ${result.url}`);
        console.log(`Tunnel ID: ${result.tunnelId}`);
        console.log(`Expires: ${new Date(result.expiresAt).toISOString()}`);
        console.log("Running in foreground. Press Ctrl+C to stop.");
        try {
          await startDaemon({
            tunnelId: result.tunnelId,
            apiClient,
            socketPath,
            infoPath,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Daemon failed: ${message}`);
          process.exit(1);
        }
      } else {
        const daemonScript = path.join(import.meta.dirname, "tunnel-daemon-entry.js");
        const config = getConfig();
        const child = fork(daemonScript, [], {
          detached: true,
          stdio: "ignore",
          env: {
            ...process.env,
            PUBBLUE_DAEMON_TUNNEL_ID: result.tunnelId,
            PUBBLUE_DAEMON_BASE_URL: config.baseUrl,
            PUBBLUE_DAEMON_API_KEY: config.apiKey,
            PUBBLUE_DAEMON_SOCKET: socketPath,
            PUBBLUE_DAEMON_INFO: infoPath,
          },
        });
        child.unref();

        // Wait for daemon readiness (info file appears) or early exit
        const ready = await waitForDaemonReady(infoPath, child, 5000);
        if (!ready) {
          console.error("Daemon failed to start. Cleaning up tunnel...");
          await apiClient.close(result.tunnelId).catch(() => {});
          process.exit(1);
        }

        console.log(`Tunnel started: ${result.url}`);
        console.log(`Tunnel ID: ${result.tunnelId}`);
        console.log(`Expires: ${new Date(result.expiresAt).toISOString()}`);
      }
    });

  tunnel
    .command("write")
    .description("Write data to a channel")
    .argument("[message]", "Text message (or use --file)")
    .option("-t, --tunnel <tunnelId>", "Tunnel ID (auto-detected if one active)")
    .option("-c, --channel <channel>", "Channel name", "chat")
    .option("-f, --file <file>", "Read content from file")
    .action(
      async (
        messageArg: string | undefined,
        opts: { tunnel?: string; channel: string; file?: string },
      ) => {
        let msg: BridgeMessage;
        let binaryBase64: string | undefined;

        if (opts.file) {
          const filePath = path.resolve(opts.file);
          const ext = path.extname(filePath).toLowerCase();
          const bytes = fs.readFileSync(filePath);
          const filename = path.basename(filePath);

          if (ext === ".html" || ext === ".htm") {
            msg = {
              id: generateMessageId(),
              type: "html",
              data: bytes.toString("utf-8"),
              meta: { title: filename, filename, mime: getMimeType(filePath), size: bytes.length },
            };
          } else if (TEXT_FILE_EXTENSIONS.has(ext)) {
            msg = {
              id: generateMessageId(),
              type: "text",
              data: bytes.toString("utf-8"),
              meta: { filename, mime: getMimeType(filePath), size: bytes.length },
            };
          } else {
            msg = {
              id: generateMessageId(),
              type: "binary",
              meta: { filename, mime: getMimeType(filePath), size: bytes.length },
            };
            binaryBase64 = bytes.toString("base64");
          }
        } else if (messageArg) {
          msg = {
            id: generateMessageId(),
            type: "text",
            data: messageArg,
          };
        } else {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
          msg = {
            id: generateMessageId(),
            type: "text",
            data: Buffer.concat(chunks).toString("utf-8").trim(),
          };
        }

        const tunnelId = opts.tunnel || (await resolveActiveTunnel());
        const socketPath = getSocketPath(tunnelId);

        const response = await ipcCall(socketPath, {
          method: "write",
          params: { channel: opts.channel, msg, binaryBase64 },
        });
        if (!response.ok) {
          console.error(`Failed: ${response.error}`);
          process.exit(1);
        }
      },
    );

  tunnel
    .command("read")
    .description("Read buffered messages from channels")
    .argument("[tunnelId]", "Tunnel ID (auto-detected if one active)")
    .option("-t, --tunnel <tunnelId>", "Tunnel ID (alternative to positional arg)")
    .option("-c, --channel <channel>", "Filter by channel")
    .option("--follow", "Stream messages continuously")
    .option("--all", "With --follow, include all channels instead of chat-only default")
    .action(
      async (
        tunnelIdArg: string | undefined,
        opts: { tunnel?: string; channel?: string; follow?: boolean; all?: boolean },
      ) => {
        const tunnelId =
          resolveTunnelIdSelection(tunnelIdArg, opts.tunnel) || (await resolveActiveTunnel());
        const socketPath = getSocketPath(tunnelId);
        const readChannel = opts.channel || (opts.follow && !opts.all ? CHANNELS.CHAT : undefined);

        if (opts.follow) {
          if (!opts.channel && !opts.all) {
            console.error(
              "Following chat channel by default. Use `--all` to include binary/file channels.",
            );
          }

          let consecutiveFailures = 0;
          let warnedDisconnected = false;

          while (true) {
            try {
              const response = await ipcCall(socketPath, {
                method: "read",
                params: { channel: readChannel },
              });

              if (warnedDisconnected) {
                console.error("Daemon reconnected.");
                warnedDisconnected = false;
              }

              consecutiveFailures = 0;
              if (response.messages && response.messages.length > 0) {
                for (const m of response.messages) {
                  console.log(JSON.stringify(m));
                }
              }
            } catch {
              consecutiveFailures += 1;
              if (!warnedDisconnected) {
                console.error("Daemon disconnected. Waiting for recovery...");
                warnedDisconnected = true;
              }
            }

            const delayMs = getFollowReadDelayMs(warnedDisconnected, consecutiveFailures);
            await new Promise((r) => setTimeout(r, delayMs));
          }
        } else {
          const response = await ipcCall(socketPath, {
            method: "read",
            params: { channel: readChannel },
          });
          if (!response.ok) {
            console.error(`Failed: ${response.error}`);
            process.exit(1);
          }
          console.log(JSON.stringify(response.messages || [], null, 2));
        }
      },
    );

  tunnel
    .command("channels")
    .description("List active channels")
    .argument("[tunnelId]", "Tunnel ID")
    .option("-t, --tunnel <tunnelId>", "Tunnel ID (alternative to positional arg)")
    .action(async (tunnelIdArg: string | undefined, opts: { tunnel?: string }) => {
      const tunnelId =
        resolveTunnelIdSelection(tunnelIdArg, opts.tunnel) || (await resolveActiveTunnel());
      const socketPath = getSocketPath(tunnelId);
      const response = await ipcCall(socketPath, { method: "channels", params: {} });
      if (response.channels) {
        for (const ch of response.channels as Array<{ name: string; direction: string }>) {
          console.log(`  ${ch.name}  [${ch.direction}]`);
        }
      }
    });

  tunnel
    .command("status")
    .description("Check tunnel connection status")
    .argument("[tunnelId]", "Tunnel ID")
    .option("-t, --tunnel <tunnelId>", "Tunnel ID (alternative to positional arg)")
    .action(async (tunnelIdArg: string | undefined, opts: { tunnel?: string }) => {
      const tunnelId =
        resolveTunnelIdSelection(tunnelIdArg, opts.tunnel) || (await resolveActiveTunnel());
      const socketPath = getSocketPath(tunnelId);
      const response = await ipcCall(socketPath, { method: "status", params: {} });
      console.log(`  Status: ${response.connected ? "connected" : "waiting"}`);
      console.log(`  Uptime: ${response.uptime}s`);
      const chNames = Array.isArray(response.channels)
        ? response.channels.map((c: unknown) => (typeof c === "string" ? c : String(c)))
        : [];
      console.log(`  Channels: ${chNames.join(", ")}`);
      console.log(`  Buffered: ${response.bufferedMessages ?? 0} messages`);
    });

  tunnel
    .command("list")
    .description("List active tunnels")
    .action(async () => {
      const apiClient = createApiClient();
      const tunnels = await apiClient.list();
      if (tunnels.length === 0) {
        console.log("No active tunnels.");
        return;
      }
      for (const t of tunnels) {
        const age = Math.floor((Date.now() - t.createdAt) / 60_000);
        const running = isDaemonRunning(t.tunnelId) ? "running" : "no daemon";
        const conn = t.hasConnection ? "connected" : "waiting";
        console.log(`  ${t.tunnelId}  ${conn}  ${running}  ${age}m ago`);
      }
    });

  tunnel
    .command("close")
    .description("Close a tunnel and stop its daemon")
    .argument("<tunnelId>", "Tunnel ID")
    .action(async (tunnelId: string) => {
      const socketPath = getSocketPath(tunnelId);
      let closedByDaemon = false;
      try {
        const daemonResult = await ipcCall(socketPath, { method: "close", params: {} });
        closedByDaemon = daemonResult.ok;
      } catch {
        closedByDaemon = false;
      }

      if (!closedByDaemon) {
        const apiClient = createApiClient();
        try {
          await apiClient.close(tunnelId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed to close tunnel ${tunnelId}: ${message}`);
          process.exit(1);
        }
      }

      console.log(`Closed: ${tunnelId}`);
    });
}

async function resolveActiveTunnel(): Promise<string> {
  const dir = tunnelInfoDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const active: string[] = [];
  for (const f of files) {
    const tunnelId = f.replace(".json", "");
    if (isDaemonRunning(tunnelId)) active.push(tunnelId);
  }
  if (active.length === 0) {
    console.error("No active tunnels. Run `pubblue tunnel start` first.");
    process.exit(1);
  }
  if (active.length === 1) return active[0];
  console.error(`Multiple active tunnels: ${active.join(", ")}. Specify one.`);
  process.exit(1);
}

function waitForDaemonReady(
  infoPath: string,
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      resolve(value);
    };

    child.on("exit", () => done(false));

    const poll = setInterval(() => {
      if (fs.existsSync(infoPath)) done(true);
    }, 100);

    const timeout = setTimeout(() => done(false), timeoutMs);
  });
}
