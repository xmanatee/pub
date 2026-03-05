import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import {
  type BridgeMessage,
  CHANNELS,
  CONTROL_CHANNEL,
  generateMessageId,
} from "../../../shared/bridge-protocol-core";
import { errorMessage, failCli } from "../lib/cli-error.js";
import { getConfig } from "../lib/config.js";
import { getAgentSocketPath, ipcCall } from "../lib/live-ipc.js";
import { buildBridgeProcessEnv, ensureNodeDatachannelAvailable, resolveBridgeMode } from "../lib/live-runtime/bridge-runtime.js";
import { formatApiError, getFollowReadDelayMs, messageContainsPong } from "../lib/live-runtime/command-utils.js";
import { liveInfoPath, liveLogPath, readLogTail, writeLatestCliVersion } from "../lib/live-runtime/daemon-files.js";
import { buildDaemonForkStdio, isDaemonRunning, resolveActiveSlug, stopOtherDaemons, waitForDaemonReady } from "../lib/live-runtime/daemon-process.js";
import { getMimeType, TEXT_FILE_EXTENSIONS } from "../lib/live-runtime/file-payload.js";
import { parsePositiveInteger } from "../lib/number.js";
import { CLI_VERSION } from "../lib/version.js";
import { createClient } from "./shared.js";

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
    .requiredOption("--agent-name <name>", "Agent display name shown to the browser user")
    .option("--bridge <mode>", "Bridge mode: openclaw|claude-code")
    .action(async (opts: { agentName: string; bridge?: string }) => {
      await ensureNodeDatachannelAvailable();
      writeLatestCliVersion(CLI_VERSION);
      const runtimeConfig = getConfig();
      const bridgeMode = resolveBridgeMode(opts);
      const bridgeProcessEnv = buildBridgeProcessEnv(runtimeConfig.bridge);

      const socketPath = getAgentSocketPath();
      const infoPath = liveInfoPath("agent");
      const logPath = liveLogPath("agent");

      await stopOtherDaemons();

      const { fork } = await import("node:child_process");
      const daemonScript = path.join(import.meta.dirname, "live-daemon-entry.js");
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
          PUBBLUE_DAEMON_AGENT_NAME: opts.agentName,
          PUBBLUE_CLI_VERSION: CLI_VERSION,
          PUBBLUE_DAEMON_BRIDGE_MODE: bridgeMode,
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
        let tail: string | null = null;
        try {
          tail = readLogTail(logPath);
        } catch (error) {
          lines.push(`Failed to read daemon log tail: ${errorMessage(error)}`);
        }
        if (tail) {
          lines.push("---- daemon log tail ----");
          lines.push(tail.trimEnd());
          lines.push("---- end daemon log tail ----");
        }
        failCli(lines.join("\n"));
      }

      console.log("Agent daemon started. Waiting for browser to initiate live.");
      console.log(`Daemon log: ${logPath}`);
      console.log(`Bridge mode: ${bridgeMode}`);
    });
}

function registerStopCommand(program: Command): void {
  program
    .command("stop")
    .description("Stop the agent daemon (deregisters presence, closes active live)")
    .action(async () => {
      if (!isDaemonRunning("agent")) {
        console.log("Agent daemon is not running.");
        return;
      }

      await stopOtherDaemons();
      console.log("Agent daemon stopped.");
    });
}

function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Check agent daemon and live connection status")
    .action(async () => {
      const socketPath = getAgentSocketPath();
      let response;
      try {
        response = await ipcCall(socketPath, { method: "status", params: {} });
      } catch (error) {
        if (errorMessage(error) !== "Daemon not running.") {
          failCli(`Failed to fetch daemon status: ${errorMessage(error)}`);
        }
        console.log("Agent daemon is not running.");
        return;
      }
      if (!response.ok) {
        failCli(`Failed to fetch daemon status: ${response.error || "unknown error"}`);
      }

      console.log(`  Daemon: running`);
      console.log(`  Active slug: ${response.activeSlug || "(none)"}`);
      console.log(`  Status: ${response.connected ? "connected" : "waiting"}`);
      if (typeof response.signalingConnected === "boolean") {
        console.log(`  Signaling: ${response.signalingConnected ? "connected" : "reconnecting"}`);
      }
      console.log(`  Uptime: ${response.uptime}s`);
      console.log(`  Channels: ${response.channels.join(", ") || "(none)"}`);
      console.log(`  Buffered: ${response.bufferedMessages ?? 0} messages`);
      if (typeof response.lastError === "string" && response.lastError.length > 0) {
        console.log(`  Last error: ${response.lastError}`);
      }
      const logPath = liveLogPath("agent");
      if (fs.existsSync(logPath)) {
        console.log(`  Log: ${logPath}`);
      }
      const bridge = response.bridge;
      if (bridge) {
        const bridgeLabel = response.bridgeMode ?? "unknown";
        console.log(`  Bridge: ${bridgeLabel} (${bridge.running ? "running" : "stopped"})`);
        if (bridge.sessionId) {
          console.log(`  Bridge session: ${bridge.sessionId}`);
        }
        if (bridge.sessionSource) {
          console.log(`  Bridge session source: ${bridge.sessionSource}`);
        }
        if (bridge.sessionKey) {
          console.log(`  Bridge session key: ${bridge.sessionKey}`);
        }
        if (bridge.forwardedMessages !== undefined) {
          console.log(`  Bridge forwarded: ${bridge.forwardedMessages} messages`);
        }
        if (bridge.lastError) {
          console.log(`  Bridge last error: ${bridge.lastError}`);
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
        const timeoutSeconds = parsePositiveInteger(opts.timeout, "--timeout");
        const timeoutMs = timeoutSeconds * 1_000;
        const socketPath = getAgentSocketPath();
        const slug = await resolveActiveSlug().catch((error: unknown) =>
          failCli(`No active daemon. Run \`pubblue start\` first. (${errorMessage(error)})`),
        );
        const apiClient = createClient();

        const fail = (message: string): never => failCli(`Doctor failed: ${message}`);

        console.log(`Doctor: ${slug}`);

        const statusResponse = await ipcCall(socketPath, {
          method: "status",
          params: {},
        }).catch((error: unknown) => fail(`daemon is unreachable (${errorMessage(error)}).`));

        if (!statusResponse.ok) {
          fail(`daemon returned non-ok status: ${String(statusResponse.error || "unknown error")}`);
        }
        if (!statusResponse.connected) {
          fail("daemon is running but browser is not connected.");
        }

        const channelNames = Array.isArray(statusResponse.channels)
          ? statusResponse.channels.map((entry) => String(entry))
          : [];
        for (const required of [CONTROL_CHANNEL, CHANNELS.CHAT, CHANNELS.CANVAS]) {
          if (!channelNames.includes(required)) {
            fail(`required channel is missing: ${required}`);
          }
        }
        console.log("Daemon/channel check: OK");

        const live = await apiClient
          .getLive(slug)
          .catch((error: unknown) =>
            fail(`failed to fetch live info from API: ${formatApiError(error)}`),
          );

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
