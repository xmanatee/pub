import { PubApiClient } from "./lib/api.js";
import { startDaemon } from "./lib/live-daemon.js";
import type { BridgeMode } from "./lib/live-daemon-shared.js";

const baseUrl = process.env.PUBBLUE_DAEMON_BASE_URL;
const apiKey = process.env.PUBBLUE_DAEMON_API_KEY;
const socketPath = process.env.PUBBLUE_DAEMON_SOCKET;
const infoPath = process.env.PUBBLUE_DAEMON_INFO;
const cliVersion = process.env.PUBBLUE_CLI_VERSION;
const agentName = process.env.PUBBLUE_DAEMON_AGENT_NAME;
const bridgeMode = (process.env.PUBBLUE_DAEMON_BRIDGE_MODE || "openclaw") as BridgeMode;

if (!baseUrl || !apiKey || !socketPath || !infoPath) {
  console.error("Missing required env vars for daemon.");
  process.exit(1);
}

const apiClient = new PubApiClient(baseUrl, apiKey);
void startDaemon({ apiClient, socketPath, infoPath, cliVersion, bridgeMode, agentName }).catch(
  (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Daemon failed to start: ${message}`);
    process.exit(1);
  },
);
