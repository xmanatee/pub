import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import { PubApiError } from "../lib/api.js";
import {
  type BridgeMessage,
  CHANNELS,
  CONTROL_CHANNEL,
  generateMessageId,
} from "../lib/bridge-protocol.js";
import { failCli } from "../lib/cli-error.js";
import { getConfig, getTelegramMiniAppUrl } from "../lib/config.js";
import { getSocketPath, ipcCall } from "../lib/tunnel-ipc.js";
import { CLI_VERSION } from "../lib/version.js";
import {
  bridgeInfoPath,
  bridgeLogPath,
  buildBridgeProcessEnv,
  buildDaemonForkStdio,
  cleanupSessionOnStartFailure,
  createApiClient,
  type DaemonStartTarget,
  ensureBridgeReady,
  ensureNodeDatachannelAvailable,
  formatApiError,
  getFollowReadDelayMs,
  getMimeType,
  getPublicUrl,
  isBridgeRunning,
  isDaemonRunning,
  messageContainsPong,
  parseBridgeMode,
  parsePositiveIntegerOption,
  pickReusableSession,
  readBridgeProcessInfo,
  readDaemonProcessInfo,
  readLogTail,
  resolveActiveSlug,
  resolveSlugSelection,
  sessionInfoPath,
  sessionLogPath,
  shouldRestartDaemonForCliUpgrade,
  stopBridge,
  stopOtherDaemons,
  TEXT_FILE_EXTENSIONS,
  waitForAgentOffer,
  waitForDaemonReady,
  waitForProcessExit,
  writeLatestCliVersion,
} from "./tunnel-helpers.js";

export function registerSessionCommands(program: Command): void {
  registerOpenCommand(program);
  registerCloseCommand(program);
  registerStatusCommand(program);
  registerWriteCommand(program);
  registerReadCommand(program);
  registerChannelsCommand(program);
  registerDoctorCommand(program);
}

function registerOpenCommand(program: Command): void {
  program
    .command("open")
    .description("Open an interactive session on a pub (starts WebRTC daemon)")
    .argument("[slug]", "Pub slug (reuses existing session when possible)")
    .option("--expires <duration>", "Auto-close after duration (e.g. 4h, 1d)", "24h")
    .option("--new", "Always create a new session (skip reuse)")
    .option("--bridge <mode>", "Bridge mode: openclaw|none")
    .option("--foreground", "Run in foreground (don't fork, no managed bridge)")
    .action(
      async (
        slugArg: string | undefined,
        opts: {
          expires: string;
          new?: boolean;
          bridge?: string;
          foreground?: boolean;
        },
      ) => {
        await ensureNodeDatachannelAvailable();
        writeLatestCliVersion(CLI_VERSION);
        const runtimeConfig = getConfig();
        const apiClient = createApiClient(runtimeConfig);
        let target: DaemonStartTarget | null = null;
        const bridgeMode = parseBridgeMode(opts.bridge || runtimeConfig.bridge?.mode || "openclaw");
        const bridgeProcessEnv = buildBridgeProcessEnv(runtimeConfig.bridge);

        if (slugArg && !opts.new) {
          try {
            const pub = await apiClient.get(slugArg);
            if (pub.session?.status === "active" && pub.session.expiresAt > Date.now()) {
              target = {
                createdNew: false,
                expiresAt: pub.session.expiresAt,
                mode: "existing",
                slug: pub.slug,
                url: getPublicUrl(pub.slug),
              };
              console.error(`Reusing existing active session for ${pub.slug}.`);
            }
          } catch (error) {
            if (!(error instanceof PubApiError && error.status === 404)) {
              failCli(`Failed to inspect pub ${slugArg}: ${formatApiError(error)}`);
            }
          }
        } else if (!slugArg && !opts.new) {
          try {
            const pubs = await apiClient.list();
            const reusable = pickReusableSession(pubs);
            if (reusable) {
              if (!reusable.session) {
                failCli("Internal error: reusable session is missing from selected pub.");
              }
              target = {
                createdNew: false,
                expiresAt: reusable.session.expiresAt,
                mode: "existing",
                slug: reusable.slug,
                url: getPublicUrl(reusable.slug),
              };
              const activeSessions = pubs.filter(
                (p) => p.session?.status === "active" && p.session.expiresAt > Date.now(),
              );
              if (activeSessions.length > 1) {
                console.error(
                  [
                    `Multiple active sessions found: ${activeSessions.map((p) => p.slug).join(", ")}`,
                    `Reusing most recent: ${reusable.slug}.`,
                    "Use `pubblue open <slug>` to choose explicitly or --new to force creation.",
                  ].join("\n"),
                );
              } else {
                console.error(
                  `Reusing existing session for ${reusable.slug}. Use --new to force creation.`,
                );
              }
            }
          } catch (error) {
            failCli(`Failed to list pubs for session reuse check: ${formatApiError(error)}`);
          }
        }

        if (!target) {
          try {
            let created: Awaited<ReturnType<typeof apiClient.openSession>>;
            if (slugArg) {
              created = await apiClient.openSession(slugArg, {
                expiresIn: opts.expires,
              });
            } else {
              const newPub = await apiClient.create({});
              try {
                created = await apiClient.openSession(newPub.slug, {
                  expiresIn: opts.expires,
                });
              } catch (error) {
                try {
                  await apiClient.remove(newPub.slug);
                } catch (cleanupError) {
                  console.error(
                    `Warning: failed to remove pub ${newPub.slug} after open failure: ${formatApiError(cleanupError)}`,
                  );
                }
                throw error;
              }
            }
            target = {
              createdNew: true,
              expiresAt: created.expiresAt,
              mode: "created",
              slug: created.slug,
              url: created.url,
            };
          } catch (error) {
            failCli(`Failed to open session: ${formatApiError(error)}`);
          }
        }
        if (!target) {
          failCli("Failed to resolve session target.");
        }

        const socketPath = getSocketPath(target.slug);
        const infoPath = sessionInfoPath(target.slug);
        const logPath = sessionLogPath(target.slug);
        try {
          await stopOtherDaemons(target.slug);
        } catch (error) {
          failCli(error instanceof Error ? error.message : String(error));
        }

        if (opts.foreground) {
          if (bridgeMode !== "none") {
            throw new Error(
              "Foreground mode disables managed bridge process. Use background mode for --bridge openclaw.",
            );
          }
          const { startDaemon } = await import("../lib/tunnel-daemon.js");
          console.log(`Session started: ${target.url}`);
          const fgTma = getTelegramMiniAppUrl(target.slug);
          if (fgTma) console.log(`Telegram: ${fgTma}`);
          console.log(`Slug: ${target.slug}`);
          console.log(`Expires: ${new Date(target.expiresAt).toISOString()}`);
          if (target.mode === "existing") console.log("Mode: attached existing session");
          console.log("Running in foreground. Press Ctrl+C to stop.");
          try {
            await startDaemon({
              cliVersion: CLI_VERSION,
              slug: target.slug,
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

        const runningDaemonInfo = readDaemonProcessInfo(target.slug);
        if (runningDaemonInfo) {
          const daemonVersion = runningDaemonInfo.cliVersion;
          const shouldRestartForUpgrade = shouldRestartDaemonForCliUpgrade(
            daemonVersion,
            CLI_VERSION,
          );

          if (shouldRestartForUpgrade) {
            console.error(
              `Restarting daemon for CLI version ${CLI_VERSION} (running: ${daemonVersion || "unknown"}).`,
            );

            const bridgeError = await stopBridge(target.slug);
            if (bridgeError) failCli(bridgeError);

            try {
              await ipcCall(socketPath, { method: "close", params: {} });
            } catch (error) {
              failCli(
                [
                  `Failed to stop running daemon for upgrade: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                  "Run `pubblue close <slug>` and retry.",
                ].join("\n"),
              );
            }

            const daemonStopped = await waitForProcessExit(runningDaemonInfo.pid, 6_000);
            if (!daemonStopped) {
              failCli("Daemon did not stop in time during upgrade restart.");
            }
          } else {
            try {
              const status = await ipcCall(socketPath, { method: "status", params: {} });
              if (!status.ok) throw new Error(String(status.error || "status check failed"));
            } catch (error) {
              failCli(
                [
                  `Daemon process exists but is not responding: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                  "Run `pubblue close <slug>` and start again.",
                ].join("\n"),
              );
            }

            if (bridgeMode !== "none") {
              const bridgeReady = await ensureBridgeReady({
                bridgeMode,
                slug: target.slug,
                socketPath,
                bridgeProcessEnv,
                timeoutMs: 8_000,
              });
              if (!bridgeReady.ok) {
                const lines = [
                  `Bridge failed to start for running session: ${bridgeReady.reason ?? "unknown reason"}`,
                ];
                const existingBridgeLog = bridgeLogPath(target.slug);
                if (fs.existsSync(existingBridgeLog)) {
                  lines.push(`Bridge log: ${existingBridgeLog}`);
                  const bridgeTail = readLogTail(existingBridgeLog);
                  if (bridgeTail) {
                    lines.push("---- bridge log tail ----");
                    lines.push(bridgeTail.trimEnd());
                    lines.push("---- end bridge log tail ----");
                  }
                }
                failCli(lines.join("\n"));
              }
            }

            console.log(`Session started: ${target.url}`);
            const runTma = getTelegramMiniAppUrl(target.slug);
            if (runTma) console.log(`Telegram: ${runTma}`);
            console.log(`Slug: ${target.slug}`);
            console.log(`Expires: ${new Date(target.expiresAt).toISOString()}`);
            console.log("Daemon already running for this session.");
            console.log(`Daemon log: ${logPath}`);
            if (bridgeMode !== "none") {
              console.log("Bridge mode: openclaw");
              console.log(`Bridge log: ${bridgeLogPath(target.slug)}`);
            }
            return;
          }
        }

        const { fork } = await import("node:child_process");
        const daemonScript = path.join(import.meta.dirname, "tunnel-daemon-entry.js");
        const daemonLogFd = fs.openSync(logPath, "a");
        const child = fork(daemonScript, [], {
          detached: true,
          stdio: buildDaemonForkStdio(daemonLogFd),
          env: {
            ...process.env,
            PUBBLUE_DAEMON_SLUG: target.slug,
            PUBBLUE_DAEMON_BASE_URL: runtimeConfig.baseUrl,
            PUBBLUE_DAEMON_API_KEY: runtimeConfig.apiKey,
            PUBBLUE_DAEMON_SOCKET: socketPath,
            PUBBLUE_DAEMON_INFO: infoPath,
            PUBBLUE_CLI_VERSION: CLI_VERSION,
          },
        });
        fs.closeSync(daemonLogFd);
        if (child.connected) {
          child.disconnect();
        }
        child.unref();

        console.log(`Starting daemon for ${target.slug}...`);
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
          await cleanupSessionOnStartFailure(apiClient, target);
          failCli(lines.join("\n"));
        }

        const offerReady = await waitForAgentOffer({
          apiClient,
          slug: target.slug,
          timeoutMs: 5_000,
        });
        if (!offerReady.ok) {
          const lines = [
            `Daemon started but signaling is not ready: ${offerReady.reason}`,
            `Daemon log: ${logPath}`,
          ];
          const tail = readLogTail(logPath);
          if (tail) {
            lines.push("---- daemon log tail ----");
            lines.push(tail.trimEnd());
            lines.push("---- end daemon log tail ----");
          }
          await cleanupSessionOnStartFailure(apiClient, target);
          failCli(lines.join("\n"));
        }

        if (bridgeMode !== "none") {
          const bridgeReady = await ensureBridgeReady({
            bridgeMode,
            slug: target.slug,
            socketPath,
            bridgeProcessEnv,
            timeoutMs: 8_000,
          });
          if (!bridgeReady.ok) {
            const lines = [`Bridge failed to start: ${bridgeReady.reason ?? "unknown reason"}`];
            const bridgeLog = bridgeLogPath(target.slug);
            if (fs.existsSync(bridgeLog)) {
              lines.push(`Bridge log: ${bridgeLog}`);
              const bridgeTail = readLogTail(bridgeLog);
              if (bridgeTail) {
                lines.push("---- bridge log tail ----");
                lines.push(bridgeTail.trimEnd());
                lines.push("---- end bridge log tail ----");
              }
            }
            let daemonCloseWarning: string | null = null;
            try {
              await ipcCall(socketPath, { method: "close", params: {} });
            } catch (error) {
              daemonCloseWarning = `failed to stop daemon after bridge startup failure: ${
                error instanceof Error ? error.message : String(error)
              }`;
            }
            if (daemonCloseWarning) {
              lines.push(`Warning: ${daemonCloseWarning}`);
            }
            await cleanupSessionOnStartFailure(apiClient, target);
            failCli(lines.join("\n"));
          }
        }

        console.log(`Session started: ${target.url}`);
        const tma = getTelegramMiniAppUrl(target.slug);
        if (tma) console.log(`Telegram: ${tma}`);
        console.log(`Slug: ${target.slug}`);
        console.log(`Expires: ${new Date(target.expiresAt).toISOString()}`);
        if (target.mode === "existing") console.log("Mode: attached existing session");
        console.log("Daemon health: OK");
        console.log(`Daemon log: ${logPath}`);
        if (bridgeMode !== "none") {
          console.log("Bridge mode: openclaw");
          console.log(`Bridge log: ${bridgeLogPath(target.slug)}`);
        }
      },
    );
}

function registerCloseCommand(program: Command): void {
  program
    .command("close")
    .description("Close a session and stop its daemon")
    .argument("<slug>", "Pub slug")
    .action(async (slug: string) => {
      const bridgeError = await stopBridge(slug);
      if (bridgeError) console.error(bridgeError);
      fs.rmSync(bridgeInfoPath(slug), { force: true });
      const socketPath = getSocketPath(slug);
      if (isDaemonRunning(slug)) {
        try {
          await ipcCall(socketPath, { method: "close", params: {} });
        } catch (error) {
          console.error(
            `Warning: failed to stop daemon over IPC for ${slug}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      const apiClient = createApiClient();
      try {
        await apiClient.closeSession(slug);
      } catch (error) {
        const message = formatApiError(error);
        if (!/Session not found/i.test(message)) {
          failCli(`Failed to close session for ${slug}: ${message}`);
        }
      }

      console.log(`Closed: ${slug}`);
    });
}

function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Check session connection status")
    .argument("[slug]", "Pub slug")
    .option("-s, --slug <slug>", "Pub slug (alternative to positional arg)")
    .action(async (slugArg: string | undefined, opts: { slug?: string }) => {
      const slug = resolveSlugSelection(slugArg, opts.slug) || (await resolveActiveSlug());
      const socketPath = getSocketPath(slug);
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
      const logPath = sessionLogPath(slug);
      if (fs.existsSync(logPath)) {
        console.log(`  Log: ${logPath}`);
      }
      const bridgeInfo = readBridgeProcessInfo(slug);
      if (bridgeInfo) {
        const bridgeRunning = isBridgeRunning(slug);
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
      const bridgeLog = bridgeLogPath(slug);
      if (fs.existsSync(bridgeLog)) {
        console.log(`  Bridge log: ${bridgeLog}`);
      }
    });
}

function registerWriteCommand(program: Command): void {
  program
    .command("write")
    .description("Write data to a session channel")
    .argument("[message]", "Text message (or use --file)")
    .option("-s, --slug <slug>", "Pub slug (auto-detected if one active)")
    .option("-c, --channel <channel>", "Channel name", "chat")
    .option("-f, --file <file>", "Read content from file")
    .action(
      async (
        messageArg: string | undefined,
        opts: { slug?: string; channel: string; file?: string },
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

        const slug = opts.slug || (await resolveActiveSlug());
        const socketPath = getSocketPath(slug);

        const response = await ipcCall(socketPath, {
          method: "write",
          params: { channel: opts.channel, msg, binaryBase64 },
        });
        if (!response.ok) {
          failCli(`Failed: ${response.error}`);
        }
      },
    );
}

function registerReadCommand(program: Command): void {
  program
    .command("read")
    .description("Read buffered messages from session channels")
    .argument("[slug]", "Pub slug (auto-detected if one active)")
    .option("-s, --slug <slug>", "Pub slug (alternative to positional arg)")
    .option("-c, --channel <channel>", "Filter by channel")
    .option("--follow", "Stream messages continuously")
    .option("--all", "With --follow, include all channels instead of chat-only default")
    .action(
      async (
        slugArg: string | undefined,
        opts: { slug?: string; channel?: string; follow?: boolean; all?: boolean },
      ) => {
        const slug = resolveSlugSelection(slugArg, opts.slug) || (await resolveActiveSlug());
        const socketPath = getSocketPath(slug);
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
      },
    );
}

function registerChannelsCommand(program: Command): void {
  program
    .command("channels")
    .description("List active session channels")
    .argument("[slug]", "Pub slug")
    .option("-s, --slug <slug>", "Pub slug (alternative to positional arg)")
    .action(async (slugArg: string | undefined, opts: { slug?: string }) => {
      const slug = resolveSlugSelection(slugArg, opts.slug) || (await resolveActiveSlug());
      const socketPath = getSocketPath(slug);
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
    .description("Run end-to-end session checks (daemon, channels, chat/canvas ping)")
    .option("-s, --slug <slug>", "Pub slug (auto-detected if one active)")
    .option("--timeout <seconds>", "Timeout for pong wait and repeated reads", "30")
    .option("--wait-pong", "Wait for user to reply with exact text 'pong' on chat channel")
    .option("--skip-chat", "Skip chat ping check")
    .option("--skip-canvas", "Skip canvas ping check")
    .action(
      async (opts: {
        slug?: string;
        timeout: string;
        waitPong?: boolean;
        skipChat?: boolean;
        skipCanvas?: boolean;
      }) => {
        const timeoutSeconds = parsePositiveIntegerOption(opts.timeout, "--timeout");
        const timeoutMs = timeoutSeconds * 1_000;
        const slug = opts.slug || (await resolveActiveSlug());
        const socketPath = getSocketPath(slug);
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

        const session = await (async () => {
          try {
            return await apiClient.getSession(slug);
          } catch (error) {
            fail(`failed to fetch session info from API: ${formatApiError(error)}`);
          }
          throw new Error("unreachable");
        })();

        if (session.status !== "active") {
          fail(`API reports session is not active (status: ${session.status})`);
        }
        if (session.expiresAt <= Date.now()) {
          fail("API reports session is expired.");
        }
        if (typeof session.agentOffer !== "string" || session.agentOffer.length === 0) {
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

        console.log("Doctor: PASS");
      },
    );
}
