import { PubApiClient } from "./lib/api.js";
import { errorMessage } from "./lib/cli-error.js";
import { startDaemon } from "./lib/tunnel-daemon.js";
import type { BridgeMode } from "./lib/tunnel-daemon-shared.js";

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
    console.error(`Daemon failed to start: ${errorMessage(error)}`);
    process.exit(1);
  },
);
