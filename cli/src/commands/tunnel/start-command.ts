import { fork } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import { failCli } from "../../lib/cli-error.js";
import { getConfig, getTelegramMiniAppUrl } from "../../lib/config.js";
import { getSocketPath, ipcCall } from "../../lib/tunnel-ipc.js";
import { CLI_VERSION } from "../../lib/version.js";
import {
  bridgeInfoPath,
  bridgeLogPath,
  buildBridgeProcessEnv,
  buildDaemonForkStdio,
  cleanupCreatedTunnelOnStartFailure,
  createApiClient,
  type DaemonStartTarget,
  ensureBridgeReady,
  ensureNodeDatachannelAvailable,
  formatApiError,
  getPublicTunnelUrl,
  parseBridgeMode,
  pickReusableTunnel,
  readDaemonProcessInfo,
  readLogTail,
  shouldRestartDaemonForCliUpgrade,
  stopBridge,
  stopOtherDaemons,
  tunnelInfoPath,
  tunnelLogPath,
  waitForAgentOffer,
  waitForDaemonReady,
  waitForProcessExit,
  writeLatestCliVersion,
} from "../tunnel-helpers.js";

export function registerTunnelStartCommand(tunnel: Command): void {
  tunnel
    .command("start")
    .description("Start a tunnel daemon (reuses existing tunnel when possible)")
    .option("--expires <duration>", "Auto-close after duration (e.g. 4h, 1d)", "24h")
    .option("-t, --tunnel <tunnelId>", "Attach/start daemon for an existing tunnel")
    .option("--new", "Always create a new tunnel (skip single-tunnel reuse)")
    .option("--bridge <mode>", "Bridge mode: openclaw|none")
    .option("--foreground", "Run in foreground (don't fork, no managed bridge)")
    .action(
      async (opts: {
        expires: string;
        tunnel?: string;
        new?: boolean;
        bridge?: string;
        foreground?: boolean;
      }) => {
        await ensureNodeDatachannelAvailable();
        writeLatestCliVersion(CLI_VERSION);
        const runtimeConfig = getConfig();
        const apiClient = createApiClient(runtimeConfig);
        let target: DaemonStartTarget | null = null;
        const bridgeMode = parseBridgeMode(opts.bridge || runtimeConfig.bridge?.mode || "openclaw");
        const bridgeProcessEnv = buildBridgeProcessEnv(runtimeConfig.bridge);

        if (opts.tunnel) {
          try {
            const existing = await apiClient.get(opts.tunnel);
            if (existing.status === "closed" || existing.expiresAt <= Date.now()) {
              failCli(`Tunnel ${opts.tunnel} is closed or expired.`);
            }
            target = {
              createdNew: false,
              expiresAt: existing.expiresAt,
              mode: "existing",
              tunnelId: existing.tunnelId,
              url: getPublicTunnelUrl(existing.tunnelId),
            };
          } catch (error) {
            failCli(`Failed to use tunnel ${opts.tunnel}: ${formatApiError(error)}`);
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
            failCli(`Failed to list tunnels for reuse check: ${formatApiError(error)}`);
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
            failCli(`Failed to create tunnel: ${formatApiError(error)}`);
          }
        }
        if (!target) {
          failCli("Failed to resolve tunnel target.");
        }

        const socketPath = getSocketPath(target.tunnelId);
        const infoPath = tunnelInfoPath(target.tunnelId);
        const logPath = tunnelLogPath(target.tunnelId);
        try {
          await stopOtherDaemons(target.tunnelId);
        } catch (error) {
          failCli(error instanceof Error ? error.message : String(error));
        }

        if (opts.foreground) {
          if (bridgeMode !== "none") {
            throw new Error(
              "Foreground mode disables managed bridge process. Use background mode for --bridge openclaw.",
            );
          }
          const { startDaemon } = await import("../../lib/tunnel-daemon.js");
          console.log(`Tunnel started: ${target.url}`);
          const fgTma = getTelegramMiniAppUrl("tunnel", target.tunnelId);
          if (fgTma) console.log(`Telegram: ${fgTma}`);
          console.log(`Tunnel ID: ${target.tunnelId}`);
          console.log(`Expires: ${new Date(target.expiresAt).toISOString()}`);
          if (target.mode === "existing") console.log("Mode: attached existing tunnel");
          console.log("Running in foreground. Press Ctrl+C to stop.");
          try {
            await startDaemon({
              cliVersion: CLI_VERSION,
              tunnelId: target.tunnelId,
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

        const runningDaemonInfo = readDaemonProcessInfo(target.tunnelId);
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

            const bridgeError = await stopBridge(target.tunnelId);
            if (bridgeError) failCli(bridgeError);

            try {
              await ipcCall(socketPath, { method: "close", params: {} });
            } catch (error) {
              failCli(
                [
                  `Failed to stop running daemon for upgrade: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                  "Run `pubblue tunnel close <id>` and retry.",
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
                  "Run `pubblue tunnel close <id>` and start again.",
                ].join("\n"),
              );
            }

            if (bridgeMode !== "none") {
              const bridgeReady = await ensureBridgeReady({
                bridgeMode,
                tunnelId: target.tunnelId,
                socketPath,
                bridgeProcessEnv,
                timeoutMs: 8_000,
              });
              if (!bridgeReady.ok) {
                const lines = [
                  `Bridge failed to start for running tunnel: ${bridgeReady.reason ?? "unknown reason"}`,
                ];
                const existingBridgeLog = bridgeLogPath(target.tunnelId);
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

            console.log(`Tunnel started: ${target.url}`);
            const runTma = getTelegramMiniAppUrl("tunnel", target.tunnelId);
            if (runTma) console.log(`Telegram: ${runTma}`);
            console.log(`Tunnel ID: ${target.tunnelId}`);
            console.log(`Expires: ${new Date(target.expiresAt).toISOString()}`);
            console.log("Daemon already running for this tunnel.");
            console.log(`Daemon log: ${logPath}`);
            if (bridgeMode !== "none") {
              console.log("Bridge mode: openclaw");
              console.log(`Bridge log: ${bridgeLogPath(target.tunnelId)}`);
            }
            return;
          }
        }

        const daemonScript = path.join(import.meta.dirname, "tunnel-daemon-entry.js");
        const bridgeScript = path.join(import.meta.dirname, "tunnel-bridge-entry.js");
        const daemonLogFd = fs.openSync(logPath, "a");
        const child = fork(daemonScript, [], {
          detached: true,
          stdio: buildDaemonForkStdio(daemonLogFd),
          env: {
            ...bridgeProcessEnv,
            PUBBLUE_DAEMON_TUNNEL_ID: target.tunnelId,
            PUBBLUE_DAEMON_BASE_URL: runtimeConfig.baseUrl,
            PUBBLUE_DAEMON_API_KEY: runtimeConfig.apiKey,
            PUBBLUE_DAEMON_SOCKET: socketPath,
            PUBBLUE_DAEMON_INFO: infoPath,
            PUBBLUE_CLI_VERSION: CLI_VERSION,
            PUBBLUE_DAEMON_BRIDGE_MODE: bridgeMode,
            PUBBLUE_DAEMON_BRIDGE_SCRIPT: bridgeScript,
            PUBBLUE_DAEMON_BRIDGE_INFO: bridgeInfoPath(target.tunnelId),
            PUBBLUE_DAEMON_BRIDGE_LOG: bridgeLogPath(target.tunnelId),
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
          await cleanupCreatedTunnelOnStartFailure(apiClient, target);
          failCli(lines.join("\n"));
        }

        const offerReady = await waitForAgentOffer({
          apiClient,
          tunnelId: target.tunnelId,
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
          await cleanupCreatedTunnelOnStartFailure(apiClient, target);
          failCli(lines.join("\n"));
        }

        if (bridgeMode !== "none") {
          const bridgeReady = await ensureBridgeReady({
            bridgeMode,
            tunnelId: target.tunnelId,
            socketPath,
            bridgeProcessEnv,
            timeoutMs: 8_000,
          });
          if (!bridgeReady.ok) {
            const lines = [`Bridge failed to start: ${bridgeReady.reason ?? "unknown reason"}`];
            const bridgeLog = bridgeLogPath(target.tunnelId);
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
            await cleanupCreatedTunnelOnStartFailure(apiClient, target);
            failCli(lines.join("\n"));
          }
        }

        console.log(`Tunnel started: ${target.url}`);
        const tma = getTelegramMiniAppUrl("tunnel", target.tunnelId);
        if (tma) console.log(`Telegram: ${tma}`);
        console.log(`Tunnel ID: ${target.tunnelId}`);
        console.log(`Expires: ${new Date(target.expiresAt).toISOString()}`);
        if (target.mode === "existing") console.log("Mode: attached existing tunnel");
        console.log("Daemon health: OK");
        console.log(`Daemon log: ${logPath}`);
        if (bridgeMode !== "none") {
          console.log("Bridge mode: openclaw");
          console.log(`Bridge log: ${bridgeLogPath(target.tunnelId)}`);
        }
      },
    );
}
