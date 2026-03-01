/**
 * Daemon entry point — forked by `pubblue tunnel start`.
 * Reads config from env vars and starts the daemon.
 */

import { TunnelApiClient } from "./lib/tunnel-api.js";
import { startDaemon } from "./lib/tunnel-daemon.js";
import type { BridgeDaemonConfig } from "./lib/tunnel-daemon-shared.js";

const tunnelId = process.env.PUBBLUE_DAEMON_TUNNEL_ID;
const baseUrl = process.env.PUBBLUE_DAEMON_BASE_URL;
const apiKey = process.env.PUBBLUE_DAEMON_API_KEY;
const socketPath = process.env.PUBBLUE_DAEMON_SOCKET;
const infoPath = process.env.PUBBLUE_DAEMON_INFO;
const cliVersion = process.env.PUBBLUE_CLI_VERSION;

if (!tunnelId || !baseUrl || !apiKey || !socketPath || !infoPath) {
  console.error("Missing required env vars for daemon.");
  process.exit(1);
}

let bridge: BridgeDaemonConfig | undefined;
const bridgeMode = process.env.PUBBLUE_DAEMON_BRIDGE_MODE;
const bridgeScript = process.env.PUBBLUE_DAEMON_BRIDGE_SCRIPT;
const bridgeInfoPath = process.env.PUBBLUE_DAEMON_BRIDGE_INFO;
const bridgeLogPath = process.env.PUBBLUE_DAEMON_BRIDGE_LOG;
if (bridgeMode === "openclaw" && bridgeScript && bridgeInfoPath && bridgeLogPath) {
  bridge = {
    bridgeMode,
    bridgeScript,
    bridgeInfoPath,
    bridgeLogPath,
    bridgeProcessEnv: { ...process.env },
  };
}

const apiClient = new TunnelApiClient(baseUrl, apiKey);
void startDaemon({ tunnelId, apiClient, socketPath, infoPath, cliVersion, bridge }).catch(
  (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Tunnel daemon failed to start: ${message}`);
    process.exit(1);
  },
);
