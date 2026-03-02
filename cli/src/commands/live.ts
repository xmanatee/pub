import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import {
  type BridgeMessage,
  CHANNELS,
  CONTROL_CHANNEL,
  generateMessageId,
} from "../lib/bridge-protocol.js";
import { failCli } from "../lib/cli-error.js";
import { getConfig } from "../lib/config.js";
import { getAgentSocketPath, ipcCall } from "../lib/tunnel-ipc.js";
import { CLI_VERSION } from "../lib/version.js";
import {
  agentInfoPath,
  agentLogPath,
  bridgeInfoPath,
  bridgeLogPath,
  buildBridgeProcessEnv,
  buildDaemonForkStdio,
  createApiClient,
  ensureNodeDatachannelAvailable,
  formatApiError,
  getFollowReadDelayMs,
  getMimeType,
  isBridgeRunning,
  isDaemonRunning,
  messageContainsPong,
  parsePositiveIntegerOption,
  readBridgeProcessInfo,
  readLogTail,
  resolveActiveSlug,
  resolveBridgeMode,
  stopRunningDaemon,
  TEXT_FILE_EXTENSIONS,
  waitForDaemonReady,
  writeLatestCliVersion,
} from "./tunnel-helpers.js";

export function registerLiveCommands(program: Command): void {
  registerStartCommand(program);
  registerStopCommand(program);
  registerStatusCommand(program);
  registerWriteCommand(program);
  registerReadCommand(program);
  registerChannelsCommand(program);
  registerDoctorCommand(program);
}

function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start the agent daemon (registers presence, awaits live requests)")
    .option("--bridge <mode>", "Bridge mode: openclaw|none")
    .option("--foreground", "Run in foreground (don't fork, no managed bridge)")
    .action(async (opts: { bridge?: string; foreground?: boolean }) => {
      await ensureNodeDatachannelAvailable();
      writeLatestCliVersion(CLI_VERSION);
      const runtimeConfig = getConfig();
      const apiClient = createApiClient(runtimeConfig);
      resolveBridgeMode(opts);
      const bridgeProcessEnv = buildBridgeProcessEnv(runtimeConfig.bridge);

      const socketPath = getAgentSocketPath();
      const infoPath = agentInfoPath();
      const logPath = agentLogPath();

      try {
        await stopRunningDaemon();
      } catch (error) {
        failCli(error instanceof Error ? error.message : String(error));
      }

      if (opts.foreground) {
        const { startDaemon } = await import("../lib/tunnel-daemon.js");
        console.log("Agent daemon starting in foreground...");
        console.log("Press Ctrl+C to stop.");
        try {
          await startDaemon({
            cliVersion: CLI_VERSION,
            apiClient,
            socketPath,
            infoPath,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failCli(`Daemon failed: ${message}`);
        }
        return;
      }

      const { fork } = await import("node:child_process");
      const daemonScript = path.join(import.meta.dirname, "tunnel-daemon-entry.js");
      const bridgeScript = path.join(import.meta.dirname, "tunnel-bridge-entry.js");
      const daemonLogFd = fs.openSync(logPath, "a");
      const child = fork(daemonScript, [], {
        detached: true,
        stdio: buildDaemonForkStdio(daemonLogFd),
        env: {
          ...bridgeProcessEnv,
          PUBBLUE_DAEMON_BASE_URL: runtimeConfig.baseUrl,
          PUBBLUE_DAEMON_API_KEY: runtimeConfig.apiKey,
          PUBBLUE_DAEMON_SOCKET: socketPath,
          PUBBLUE_DAEMON_INFO: infoPath,
          PUBBLUE_CLI_VERSION: CLI_VERSION,
          PUBBLUE_DAEMON_BRIDGE_SCRIPT: bridgeScript,
          PUBBLUE_DAEMON_BRIDGE_INFO: bridgeInfoPath("agent"),
          PUBBLUE_DAEMON_BRIDGE_LOG: bridgeLogPath("agent"),
        },
      });
      fs.closeSync(daemonLogFd);
      if (child.connected) {
        child.disconnect();
      }
      child.unref();

      console.log("Starting agent daemon...");
      const ready = await waitForDaemonReady({
        child,
        infoPath,
        socketPath,
        timeoutMs: 8_000,
      });
      if (!ready.ok) {
        const lines = [
          `Daemon failed to start: ${ready.reason ?? "unknown reason"}`,
          `Daemon log: ${logPath}`,
        ];
        const tail = readLogTail(logPath);
        if (tail) {
          lines.push("---- daemon log tail ----");
          lines.push(tail.trimEnd());
          lines.push("---- end daemon log tail ----");
        }
        failCli(lines.join("\n"));
      }

      console.log("Agent daemon started. Waiting for browser to initiate live.");
      console.log(`Daemon log: ${logPath}`);
    });
}

function registerStopCommand(program: Command): void {
  program
    .command("stop")
    .description("Stop the agent daemon (deregisters presence, closes active live)")
    .action(async () => {
      if (!isDaemonRunning()) {
        console.log("Agent daemon is not running.");
        return;
      }

      try {
        await stopRunningDaemon();
      } catch (error) {
        failCli(error instanceof Error ? error.message : String(error));
      }

      console.log("Agent daemon stopped.");
    });
}

function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Check agent daemon and live connection status")
    .action(async () => {
      const socketPath = getAgentSocketPath();
      let response: Record<string, unknown>;
      try {
        response = await ipcCall(socketPath, { method: "status", params: {} });
      } catch {
        console.log("Agent daemon is not running.");
        return;
      }

      const activeSlug = response.activeSlug as string | null;
      console.log(`  Daemon: running`);
      console.log(`  Active slug: ${activeSlug || "(none)"}`);
      console.log(`  Status: ${response.connected ? "connected" : "waiting"}`);
      console.log(`  Uptime: ${response.uptime}s`);
      const chNames = Array.isArray(response.channels)
        ? response.channels.map((c: unknown) => (typeof c === "string" ? c : String(c)))
        : [];
      console.log(`  Channels: ${chNames.join(", ") || "(none)"}`);
      console.log(`  Buffered: ${response.bufferedMessages ?? 0} messages`);
      if (typeof response.lastError === "string" && response.lastError.length > 0) {
        console.log(`  Last error: ${response.lastError}`);
      }
      const logPath = agentLogPath();
      if (fs.existsSync(logPath)) {
        console.log(`  Log: ${logPath}`);
      }
      if (activeSlug) {
        const bridgeInfo = readBridgeProcessInfo(activeSlug);
        if (bridgeInfo) {
          const bridgeRunning = isBridgeRunning(activeSlug);
          const bridgeState = bridgeInfo.status || (bridgeRunning ? "running" : "stopped");
          console.log(`  Bridge: ${bridgeInfo.mode} (${bridgeState})`);
          if (bridgeInfo.sessionId) {
            console.log(`  Bridge session: ${bridgeInfo.sessionId}`);
          }
          if (bridgeInfo.sessionSource) {
            console.log(`  Bridge session source: ${bridgeInfo.sessionSource}`);
          }
          if (bridgeInfo.sessionKey) {
            console.log(`  Bridge session key: ${bridgeInfo.sessionKey}`);
          }
          if (bridgeInfo.lastError) {
            console.log(`  Bridge last error: ${bridgeInfo.lastError}`);
          }
        }
        const bridgeLog = bridgeLogPath(activeSlug);
        if (fs.existsSync(bridgeLog)) {
          console.log(`  Bridge log: ${bridgeLog}`);
        }
      }
    });
}

function registerWriteCommand(program: Command): void {
  program
    .command("write")
    .description("Write data to a live channel")
    .argument("[message]", "Text message (or use --file)")
    .option("-c, --channel <channel>", "Channel name", "chat")
    .option("-f, --file <file>", "Read content from file")
    .action(async (messageArg: string | undefined, opts: { channel: string; file?: string }) => {
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

      const socketPath = getAgentSocketPath();

      const response = await ipcCall(socketPath, {
        method: "write",
        params: { channel: opts.channel, msg, binaryBase64 },
      });
      if (!response.ok) {
        failCli(`Failed: ${response.error}`);
      }
    });
}

function registerReadCommand(program: Command): void {
  program
    .command("read")
    .description("Read buffered messages from live channels")
    .option("-c, --channel <channel>", "Filter by channel")
    .option("--follow", "Stream messages continuously")
    .option("--all", "With --follow, include all channels instead of chat-only default")
    .action(async (opts: { channel?: string; follow?: boolean; all?: boolean }) => {
      const socketPath = getAgentSocketPath();
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
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } else {
        const response = await ipcCall(socketPath, {
          method: "read",
          params: { channel: readChannel },
        });
        if (!response.ok) {
          failCli(`Failed: ${response.error}`);
        }
        console.log(JSON.stringify(response.messages || [], null, 2));
      }
    });
}

function registerChannelsCommand(program: Command): void {
  program
    .command("channels")
    .description("List active live channels")
    .action(async () => {
      const socketPath = getAgentSocketPath();
      const response = await ipcCall(socketPath, { method: "channels", params: {} });
      if (response.channels) {
        for (const ch of response.channels as Array<{ name: string; direction: string }>) {
          console.log(`  ${ch.name}  [${ch.direction}]`);
        }
      }
    });
}

function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run end-to-end live checks (daemon, channels, chat/canvas ping)")
    .option("--timeout <seconds>", "Timeout for pong wait and repeated reads", "30")
    .option("--wait-pong", "Wait for user to reply with exact text 'pong' on chat channel")
    .option("--skip-chat", "Skip chat ping check")
    .option("--skip-canvas", "Skip canvas ping check")
    .action(
      async (opts: {
        timeout: string;
        waitPong?: boolean;
        skipChat?: boolean;
        skipCanvas?: boolean;
      }) => {
        const timeoutSeconds = parsePositiveIntegerOption(opts.timeout, "--timeout");
        const timeoutMs = timeoutSeconds * 1_000;
        const socketPath = getAgentSocketPath();
        const slug = await resolveActiveSlug();
        const apiClient = createApiClient();

        const fail = (message: string): never => failCli(`Doctor failed: ${message}`);

        console.log(`Doctor: ${slug}`);

        let statusResponse: Record<string, unknown> | null = null;
        try {
          statusResponse = await ipcCall(socketPath, {
            method: "status",
            params: {},
          });
        } catch (error) {
          fail(
            `daemon is unreachable (${error instanceof Error ? error.message : String(error)}).`,
          );
        }
        if (!statusResponse) {
          fail("daemon status returned no response.");
        }
        const daemonStatus = statusResponse as Record<string, unknown>;

        if (!daemonStatus.ok) {
          fail(`daemon returned non-ok status: ${String(daemonStatus.error || "unknown error")}`);
        }
        if (!daemonStatus.connected) {
          fail("daemon is running but browser is not connected.");
        }

        const channelNames = Array.isArray(daemonStatus.channels)
          ? daemonStatus.channels.map((entry) => String(entry))
          : [];
        for (const required of [CONTROL_CHANNEL, CHANNELS.CHAT, CHANNELS.CANVAS]) {
          if (!channelNames.includes(required)) {
            fail(`required channel is missing: ${required}`);
          }
        }
        console.log("Daemon/channel check: OK");

        const live = await (async () => {
          try {
            return await apiClient.getLive(slug);
          } catch (error) {
            fail(`failed to fetch live info from API: ${formatApiError(error)}`);
          }
          throw new Error("unreachable");
        })();

        if (live.status !== "active") {
          fail(`API reports live is not active (status: ${live.status})`);
        }
        if (live.expiresAt <= Date.now()) {
          fail("API reports live is expired.");
        }
        if (typeof live.browserOffer !== "string" || live.browserOffer.length === 0) {
          fail("browser offer was not published.");
        }
        if (typeof live.agentAnswer !== "string" || live.agentAnswer.length === 0) {
          fail("agent answer was not published.");
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

        console.log("Doctor: PASS");
      },
    );
}
