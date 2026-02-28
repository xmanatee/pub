import type { ChildProcess } from "node:child_process";
import { fork } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Command } from "commander";
import { type BridgeMessage, CHANNELS, generateMessageId } from "../lib/bridge-protocol.js";
import { getConfig } from "../lib/config.js";
import {
  TunnelApiClient,
  TunnelApiError,
  type TunnelInfo,
  type TunnelListItem,
} from "../lib/tunnel-api.js";
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

function tunnelLogPath(tunnelId: string): string {
  return path.join(tunnelInfoDir(), `${tunnelId}.log`);
}

function bridgeInfoPath(tunnelId: string): string {
  return path.join(tunnelInfoDir(), `${tunnelId}.bridge.json`);
}

function bridgeLogPath(tunnelId: string): string {
  return path.join(tunnelInfoDir(), `${tunnelId}.bridge.log`);
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

interface BridgeProcessInfo {
  pid: number;
  tunnelId: string;
  mode: string;
  sessionId?: string;
  startedAt: number;
  status?: string;
  lastError?: string;
}

function readBridgeProcessInfo(tunnelId: string): BridgeProcessInfo | null {
  const infoPath = bridgeInfoPath(tunnelId);
  if (!fs.existsSync(infoPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(infoPath, "utf-8")) as BridgeProcessInfo;
  } catch {
    return null;
  }
}

function isBridgeRunning(tunnelId: string): boolean {
  const infoPath = bridgeInfoPath(tunnelId);
  if (!fs.existsSync(infoPath)) return false;
  try {
    const info = JSON.parse(fs.readFileSync(infoPath, "utf-8")) as BridgeProcessInfo;
    process.kill(info.pid, 0);
    return true;
  } catch {
    try {
      fs.unlinkSync(infoPath);
    } catch {
      // ignore stale bridge cleanup failures
    }
    return false;
  }
}

function stopBridgeProcess(tunnelId: string): void {
  const info = readBridgeProcessInfo(tunnelId);
  if (!info || !Number.isFinite(info.pid)) return;
  try {
    process.kill(info.pid, "SIGTERM");
  } catch {
    // ignore if already stopped
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

export function messageContainsPong(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const message = (payload as { msg?: unknown }).msg;
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  const data = (message as { data?: unknown }).data;
  return type === "text" && typeof data === "string" && data.trim().toLowerCase() === "pong";
}

function getPublicTunnelUrl(tunnelId: string): string {
  const base = process.env.PUBBLUE_PUBLIC_URL || "https://pub.blue";
  return `${base.replace(/\/$/, "")}/t/${tunnelId}`;
}

export function pickReusableTunnel(
  tunnels: TunnelListItem[],
  nowMs = Date.now(),
): TunnelListItem | null {
  const active = tunnels
    .filter((t) => t.status === "active" && t.expiresAt > nowMs)
    .sort((a, b) => b.createdAt - a.createdAt);
  return active[0] ?? null;
}

function readLogTail(logPath: string, maxChars = 4_000): string | null {
  if (!fs.existsSync(logPath)) return null;
  try {
    const content = fs.readFileSync(logPath, "utf-8");
    if (content.length <= maxChars) return content;
    return content.slice(-maxChars);
  } catch {
    return null;
  }
}

function formatApiError(error: unknown): string {
  if (error instanceof TunnelApiError) {
    if (error.status === 429 && error.retryAfterSeconds !== undefined) {
      return `Rate limit exceeded. Retry after ${error.retryAfterSeconds}s.`;
    }
    return `${error.message} (HTTP ${error.status})`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function cleanupCreatedTunnelOnStartFailure(
  apiClient: TunnelApiClient,
  target: DaemonStartTarget,
): Promise<void> {
  if (!target.createdNew) return;
  try {
    await apiClient.close(target.tunnelId);
  } catch (closeError) {
    console.error(
      `Failed to clean up newly created tunnel ${target.tunnelId}: ${formatApiError(closeError)}`,
    );
  }
}

interface DaemonStartTarget {
  createdNew: boolean;
  expiresAt: number;
  mode: "created" | "existing";
  tunnelId: string;
  url: string;
}

export function registerTunnelCommands(program: Command): void {
  const tunnel = program.command("tunnel").description("P2P encrypted tunnel to browser");

  tunnel
    .command("start")
    .description("Start a tunnel daemon (reuses existing tunnel when possible)")
    .option("--expires <duration>", "Auto-close after duration (e.g. 4h, 1d)", "24h")
    .option("-t, --tunnel <tunnelId>", "Attach/start daemon for an existing tunnel")
    .option("--new", "Always create a new tunnel (skip single-tunnel reuse)")
    .option("--foreground", "Run in foreground (don't fork)")
    .action(
      async (opts: { expires: string; tunnel?: string; new?: boolean; foreground?: boolean }) => {
        await ensureNodeDatachannelAvailable();
        const apiClient = createApiClient();
        let target: DaemonStartTarget | null = null;

        if (opts.tunnel) {
          try {
            const existing = await apiClient.get(opts.tunnel);
            if (existing.status === "closed" || existing.expiresAt <= Date.now()) {
              console.error(`Tunnel ${opts.tunnel} is closed or expired.`);
              process.exit(1);
            }
            target = {
              createdNew: false,
              expiresAt: existing.expiresAt,
              mode: "existing",
              tunnelId: existing.tunnelId,
              url: getPublicTunnelUrl(existing.tunnelId),
            };
          } catch (error) {
            console.error(`Failed to use tunnel ${opts.tunnel}: ${formatApiError(error)}`);
            process.exit(1);
          }
        } else if (!opts.new) {
          try {
            const listed = await apiClient.list();
            const active = listed
              .filter((t) => t.status === "active" && t.expiresAt > Date.now())
              .sort((a, b) => b.createdAt - a.createdAt);
            const reusable = pickReusableTunnel(listed);
            if (reusable) {
              target = {
                createdNew: false,
                expiresAt: reusable.expiresAt,
                mode: "existing",
                tunnelId: reusable.tunnelId,
                url: getPublicTunnelUrl(reusable.tunnelId),
              };
              if (active.length > 1) {
                console.error(
                  [
                    `Multiple active tunnels found: ${active.map((t) => t.tunnelId).join(", ")}`,
                    `Reusing most recent active tunnel ${reusable.tunnelId}.`,
                    "Use --tunnel <id> to choose explicitly or --new to force creation.",
                  ].join("\n"),
                );
              } else {
                console.error(
                  `Reusing existing active tunnel ${reusable.tunnelId}. Use --new to force creation.`,
                );
              }
            }
          } catch (error) {
            console.error(`Failed to list tunnels for reuse check: ${formatApiError(error)}`);
            process.exit(1);
          }
        }

        if (!target) {
          try {
            const created = await apiClient.create({
              expiresIn: opts.expires,
            });
            target = {
              createdNew: true,
              expiresAt: created.expiresAt,
              mode: "created",
              tunnelId: created.tunnelId,
              url: created.url,
            };
          } catch (error) {
            console.error(`Failed to create tunnel: ${formatApiError(error)}`);
            process.exit(1);
          }
        }
        if (!target) {
          console.error("Failed to resolve tunnel target.");
          process.exit(1);
        }

        const socketPath = getSocketPath(target.tunnelId);
        const infoPath = tunnelInfoPath(target.tunnelId);
        const logPath = tunnelLogPath(target.tunnelId);

        if (opts.foreground) {
          const { startDaemon } = await import("../lib/tunnel-daemon.js");
          console.log(`Tunnel started: ${target.url}`);
          console.log(`Tunnel ID: ${target.tunnelId}`);
          console.log(`Expires: ${new Date(target.expiresAt).toISOString()}`);
          if (target.mode === "existing") console.log("Mode: attached existing tunnel");
          console.log("Running in foreground. Press Ctrl+C to stop.");
          try {
            await startDaemon({
              tunnelId: target.tunnelId,
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
          if (isDaemonRunning(target.tunnelId)) {
            try {
              const status = await ipcCall(socketPath, { method: "status", params: {} });
              if (!status.ok) throw new Error(String(status.error || "status check failed"));
            } catch (error) {
              console.error(
                `Daemon process exists but is not responding: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
              console.error("Run `pubblue tunnel close <id>` and start again.");
              process.exit(1);
            }
            console.log(`Tunnel started: ${target.url}`);
            console.log(`Tunnel ID: ${target.tunnelId}`);
            console.log(`Expires: ${new Date(target.expiresAt).toISOString()}`);
            console.log("Daemon already running for this tunnel.");
            console.log(`Daemon log: ${logPath}`);
            return;
          }

          const daemonScript = path.join(import.meta.dirname, "tunnel-daemon-entry.js");
          const config = getConfig();
          const daemonLogFd = fs.openSync(logPath, "a");
          const child = fork(daemonScript, [], {
            detached: true,
            stdio: buildDaemonForkStdio(daemonLogFd),
            env: {
              ...process.env,
              PUBBLUE_DAEMON_TUNNEL_ID: target.tunnelId,
              PUBBLUE_DAEMON_BASE_URL: config.baseUrl,
              PUBBLUE_DAEMON_API_KEY: config.apiKey,
              PUBBLUE_DAEMON_SOCKET: socketPath,
              PUBBLUE_DAEMON_INFO: infoPath,
            },
          });
          fs.closeSync(daemonLogFd);
          if (child.connected) {
            child.disconnect();
          }
          child.unref();

          console.log(`Starting daemon for tunnel ${target.tunnelId}...`);
          const ready = await waitForDaemonReady({
            child,
            infoPath,
            socketPath,
            timeoutMs: 8_000,
          });
          if (!ready.ok) {
            console.error(`Daemon failed to start: ${ready.reason ?? "unknown reason"}`);
            console.error(`Daemon log: ${logPath}`);
            const tail = readLogTail(logPath);
            if (tail) {
              console.error("---- daemon log tail ----");
              console.error(tail.trimEnd());
              console.error("---- end daemon log tail ----");
            }
            await cleanupCreatedTunnelOnStartFailure(apiClient, target);
            process.exit(1);
          }

          const offerReady = await waitForAgentOffer({
            apiClient,
            tunnelId: target.tunnelId,
            timeoutMs: 5_000,
          });
          if (!offerReady.ok) {
            console.error(`Daemon started but signaling is not ready: ${offerReady.reason}`);
            console.error(`Daemon log: ${logPath}`);
            const tail = readLogTail(logPath);
            if (tail) {
              console.error("---- daemon log tail ----");
              console.error(tail.trimEnd());
              console.error("---- end daemon log tail ----");
            }
            await cleanupCreatedTunnelOnStartFailure(apiClient, target);
            process.exit(1);
          }

          console.log(`Tunnel started: ${target.url}`);
          console.log(`Tunnel ID: ${target.tunnelId}`);
          console.log(`Expires: ${new Date(target.expiresAt).toISOString()}`);
          if (target.mode === "existing") console.log("Mode: attached existing tunnel");
          console.log("Daemon health: OK");
          console.log(`Daemon log: ${logPath}`);
        }
      },
    );

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
            } catch (error) {
              consecutiveFailures += 1;
              if (!warnedDisconnected) {
                const detail = error instanceof Error ? ` ${error.message}` : "";
                console.error(`Daemon disconnected. Waiting for recovery...${detail}`);
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
      if (typeof response.lastError === "string" && response.lastError.length > 0) {
        console.log(`  Last error: ${response.lastError}`);
      }
      const logPath = tunnelLogPath(tunnelId);
      if (fs.existsSync(logPath)) {
        console.log(`  Log: ${logPath}`);
      }
    });

  tunnel
    .command("doctor")
    .description("Run strict end-to-end tunnel checks (daemon, channels, chat/canvas ping)")
    .option("-t, --tunnel <tunnelId>", "Tunnel ID (auto-detected if one active)")
    .option("--timeout <seconds>", "Timeout for pong wait and repeated reads", "30")
    .option("--wait-pong", "Wait for user to reply with exact text 'pong' on chat channel")
    .option("--skip-chat", "Skip chat ping check")
    .option("--skip-canvas", "Skip canvas ping check")
    .action(
      async (opts: {
        tunnel?: string;
        timeout: string;
        waitPong?: boolean;
        skipChat?: boolean;
        skipCanvas?: boolean;
      }) => {
        const timeoutSeconds = parsePositiveIntegerOption(opts.timeout, "--timeout");
        const timeoutMs = timeoutSeconds * 1_000;
        const tunnelId = opts.tunnel || (await resolveActiveTunnel());
        const socketPath = getSocketPath(tunnelId);
        const apiClient = createApiClient();

        const fail = (message: string): never => {
          console.error(`Doctor failed: ${message}`);
          process.exit(1);
        };

        console.log(`Doctor tunnel: ${tunnelId}`);

        let statusResponse: Record<string, unknown>;
        try {
          statusResponse = await ipcCall(socketPath, { method: "status", params: {} });
        } catch (error) {
          fail(
            `daemon is unreachable (${error instanceof Error ? error.message : String(error)}).`,
          );
        }

        if (!statusResponse.ok) {
          fail(`daemon returned non-ok status: ${String(statusResponse.error || "unknown error")}`);
        }
        if (!statusResponse.connected) {
          fail("daemon is running but browser is not connected.");
        }

        const channelNames = Array.isArray(statusResponse.channels)
          ? statusResponse.channels.map((entry) => String(entry))
          : [];
        for (const required of [CHANNELS.CONTROL, CHANNELS.CHAT, CHANNELS.CANVAS]) {
          if (!channelNames.includes(required)) {
            fail(`required channel is missing: ${required}`);
          }
        }
        console.log("Daemon/channel check: OK");

        let tunnelInfo: TunnelInfo;
        try {
          tunnelInfo = await apiClient.get(tunnelId);
        } catch (error) {
          fail(`failed to fetch tunnel info from API: ${formatApiError(error)}`);
        }

        if (tunnelInfo.status !== "active") {
          fail(`API reports tunnel is not active (status: ${tunnelInfo.status})`);
        }
        if (tunnelInfo.expiresAt <= Date.now()) {
          fail("API reports tunnel is expired.");
        }
        if (!tunnelInfo.hasConnection) {
          fail("API reports no browser connection.");
        }
        if (typeof tunnelInfo.agentOffer !== "string" || tunnelInfo.agentOffer.length === 0) {
          fail("agent offer was not published.");
        }
        console.log("API/signaling check: OK");

        if (!opts.skipChat) {
          const pingText = "This is a ping test. Reply with 'pong'.";
          const pingMsg: BridgeMessage = {
            id: generateMessageId(),
            type: "text",
            data: pingText,
          };
          const writeResponse = await ipcCall(socketPath, {
            method: "write",
            params: { channel: CHANNELS.CHAT, msg: pingMsg },
          });
          if (!writeResponse.ok) {
            fail(`chat ping failed: ${String(writeResponse.error || "unknown write error")}`);
          }
          console.log("Chat ping write ACK: OK");

          if (opts.waitPong) {
            const startedAt = Date.now();
            let receivedPong = false;
            while (Date.now() - startedAt < timeoutMs) {
              const readResponse = await ipcCall(socketPath, {
                method: "read",
                params: { channel: CHANNELS.CHAT },
              });
              if (!readResponse.ok) {
                fail(
                  `chat read failed while waiting for pong: ${String(readResponse.error || "unknown read error")}`,
                );
              }
              const messages = Array.isArray(readResponse.messages) ? readResponse.messages : [];
              if (messages.some((entry) => messageContainsPong(entry))) {
                receivedPong = true;
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 1_000));
            }

            if (!receivedPong) {
              fail(
                `timed out after ${timeoutSeconds}s waiting for exact 'pong' reply on chat channel.`,
              );
            }
            console.log("Chat pong roundtrip: OK");
          }
        }

        if (!opts.skipCanvas) {
          const stamp = new Date().toISOString();
          const canvasMsg: BridgeMessage = {
            id: generateMessageId(),
            type: "html",
            data: `<!doctype html><html><body style="margin:0;padding:24px;font-family:system-ui;background:#111;color:#f5f5f5">Canvas ping OK<br><small>${stamp}</small></body></html>`,
          };
          const canvasResponse = await ipcCall(socketPath, {
            method: "write",
            params: { channel: CHANNELS.CANVAS, msg: canvasMsg },
          });
          if (!canvasResponse.ok) {
            fail(`canvas ping failed: ${String(canvasResponse.error || "unknown write error")}`);
          }
          console.log("Canvas ping write ACK: OK");
        }

        console.log("Tunnel doctor: PASS");
      },
    );

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
      try {
        await ipcCall(socketPath, { method: "close", params: {} });
      } catch {
        // Daemon may already be stopped; continue with API close.
      }

      const apiClient = createApiClient();
      try {
        await apiClient.close(tunnelId);
      } catch (error) {
        const message = formatApiError(error);
        if (!/Tunnel not found/i.test(message)) {
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

function waitForDaemonReady({
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
          lastIpcError = error instanceof Error ? error.message : String(error);
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

async function waitForAgentOffer(params: {
  apiClient: TunnelApiClient;
  tunnelId: string;
  timeoutMs: number;
}): Promise<WaitForDaemonReadyResult> {
  const startedAt = Date.now();
  let lastError: string | null = null;

  while (Date.now() - startedAt < params.timeoutMs) {
    try {
      const tunnel = await params.apiClient.get(params.tunnelId);
      if (typeof tunnel.agentOffer === "string" && tunnel.agentOffer.length > 0) {
        return { ok: true };
      }
    } catch (error) {
      lastError = formatApiError(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return {
    ok: false,
    reason: lastError
      ? `agent offer was not published in time (last API error: ${lastError})`
      : "agent offer was not published in time",
  };
}
