import * as fs from "node:fs";
import type { Command } from "commander";
import {
  type BridgeMessage,
  CHANNELS,
  CONTROL_CHANNEL,
  generateMessageId,
} from "../../lib/bridge-protocol.js";
import { failCli } from "../../lib/cli-error.js";
import { getSocketPath, ipcCall } from "../../lib/tunnel-ipc.js";
import {
  bridgeInfoPath,
  bridgeLogPath,
  createApiClient,
  formatApiError,
  isBridgeRunning,
  isDaemonRunning,
  messageContainsPong,
  parsePositiveIntegerOption,
  readBridgeProcessInfo,
  resolveActiveTunnel,
  resolveTunnelIdSelection,
  stopBridgeProcess,
  tunnelLogPath,
} from "../tunnel-helpers.js";

export function registerTunnelManagementCommands(tunnel: Command): void {
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
      const bridgeInfo = readBridgeProcessInfo(tunnelId);
      if (bridgeInfo) {
        const bridgeRunning = isBridgeRunning(tunnelId);
        const bridgeState = bridgeInfo.status || (bridgeRunning ? "running" : "stopped");
        console.log(`  Bridge: ${bridgeInfo.mode} (${bridgeState})`);
        if (bridgeInfo.sessionId) {
          console.log(`  Bridge session: ${bridgeInfo.sessionId}`);
        }
        if (!bridgeRunning && bridgeInfo.lastError) {
          console.log(`  Bridge error: ${bridgeInfo.lastError}`);
        }
      }
      const bridgeLog = bridgeLogPath(tunnelId);
      if (fs.existsSync(bridgeLog)) {
        console.log(`  Bridge log: ${bridgeLog}`);
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

        const fail = (message: string): never => failCli(`Doctor failed: ${message}`);

        console.log(`Doctor tunnel: ${tunnelId}`);

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

        let apiTunnel!: Awaited<ReturnType<typeof apiClient.get>>;
        try {
          apiTunnel = await apiClient.get(tunnelId);
        } catch (error) {
          fail(`failed to fetch tunnel info from API: ${formatApiError(error)}`);
        }

        if (apiTunnel.status !== "active") {
          fail(`API reports tunnel is not active (status: ${apiTunnel.status})`);
        }
        if (apiTunnel.expiresAt <= Date.now()) {
          fail("API reports tunnel is expired.");
        }
        if (!apiTunnel.hasConnection) {
          fail("API reports no browser connection.");
        }
        if (typeof apiTunnel.agentOffer !== "string" || apiTunnel.agentOffer.length === 0) {
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
        const bridgeInfo = readBridgeProcessInfo(t.tunnelId);
        const bridge = bridgeInfo
          ? isBridgeRunning(t.tunnelId)
            ? `${bridgeInfo.mode}:running`
            : `${bridgeInfo.mode}:stopped`
          : "none";
        const conn = t.hasConnection ? "connected" : "waiting";
        console.log(`  ${t.tunnelId}  ${conn}  ${running}  bridge=${bridge}  ${age}m ago`);
      }
    });

  tunnel
    .command("close")
    .description("Close a tunnel and stop its daemon")
    .argument("<tunnelId>", "Tunnel ID")
    .action(async (tunnelId: string) => {
      stopBridgeProcess(tunnelId);
      try {
        fs.unlinkSync(bridgeInfoPath(tunnelId));
      } catch {
        // bridge info may not exist
      }
      const socketPath = getSocketPath(tunnelId);
      try {
        await ipcCall(socketPath, { method: "close", params: {} });
      } catch {
        // daemon may already be stopped; continue with API close.
      }

      const apiClient = createApiClient();
      try {
        await apiClient.close(tunnelId);
      } catch (error) {
        const message = formatApiError(error);
        if (!/Tunnel not found/i.test(message)) {
          failCli(`Failed to close tunnel ${tunnelId}: ${message}`);
        }
      }

      console.log(`Closed: ${tunnelId}`);
    });
}
