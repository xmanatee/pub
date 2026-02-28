import { fork } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import { getConfig } from "../../lib/config.js";
import { getSocketPath, ipcCall } from "../../lib/tunnel-ipc.js";
import {
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
  isDaemonRunning,
  parseBridgeMode,
  pickReusableTunnel,
  readLogTail,
  tunnelInfoPath,
  tunnelLogPath,
  waitForAgentOffer,
  waitForDaemonReady,
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
        const runtimeConfig = getConfig();
        const apiClient = createApiClient(runtimeConfig);
        let target: DaemonStartTarget | null = null;
        let bridgeMode: "openclaw" | "none";
        try {
          bridgeMode = parseBridgeMode(opts.bridge || runtimeConfig.bridge?.mode || "openclaw");
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
        const bridgeProcessEnv = buildBridgeProcessEnv(runtimeConfig.bridge);

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
          if (bridgeMode !== "none") {
            console.error(
              "Foreground mode disables managed bridge process. Use background mode for --bridge openclaw.",
            );
          }
          const { startDaemon } = await import("../../lib/tunnel-daemon.js");
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
          return;
        }

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

          if (bridgeMode !== "none") {
            const bridgeReady = await ensureBridgeReady({
              bridgeMode,
              tunnelId: target.tunnelId,
              socketPath,
              bridgeProcessEnv,
              timeoutMs: 8_000,
            });
            if (!bridgeReady.ok) {
              console.error(
                `Bridge failed to start for running tunnel: ${bridgeReady.reason ?? "unknown reason"}`,
              );
              const existingBridgeLog = bridgeLogPath(target.tunnelId);
              if (fs.existsSync(existingBridgeLog)) {
                console.error(`Bridge log: ${existingBridgeLog}`);
                const bridgeTail = readLogTail(existingBridgeLog);
                if (bridgeTail) {
                  console.error("---- bridge log tail ----");
                  console.error(bridgeTail.trimEnd());
                  console.error("---- end bridge log tail ----");
                }
              }
              process.exit(1);
            }
          }

          console.log(`Tunnel started: ${target.url}`);
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

        if (bridgeMode !== "none") {
          const bridgeReady = await ensureBridgeReady({
            bridgeMode,
            tunnelId: target.tunnelId,
            socketPath,
            bridgeProcessEnv,
            timeoutMs: 8_000,
          });
          if (!bridgeReady.ok) {
            console.error(`Bridge failed to start: ${bridgeReady.reason ?? "unknown reason"}`);
            const bridgeLog = bridgeLogPath(target.tunnelId);
            if (fs.existsSync(bridgeLog)) {
              console.error(`Bridge log: ${bridgeLog}`);
              const bridgeTail = readLogTail(bridgeLog);
              if (bridgeTail) {
                console.error("---- bridge log tail ----");
                console.error(bridgeTail.trimEnd());
                console.error("---- end bridge log tail ----");
              }
            }
            try {
              await ipcCall(socketPath, { method: "close", params: {} });
            } catch {
              // daemon may already be down
            }
            await cleanupCreatedTunnelOnStartFailure(apiClient, target);
            process.exit(1);
          }
        }

        console.log(`Tunnel started: ${target.url}`);
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
