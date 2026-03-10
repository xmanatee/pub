import { PubApiClient } from "./lib/api.js";
import { startDaemon } from "./lib/live-daemon.js";
import type { BridgeMode } from "./lib/live-daemon-shared.js";

export async function runDaemonFromEnv(): Promise<void> {
  const baseUrl = process.env.PUB_DAEMON_API_BASE_URL;
  const apiKey = process.env.PUB_DAEMON_API_KEY;
  const socketPath = process.env.PUB_DAEMON_SOCKET;
  const infoPath = process.env.PUB_DAEMON_INFO;
  const cliVersion = process.env.PUB_CLI_VERSION;
  const agentName = process.env.PUB_DAEMON_AGENT_NAME;
  const bridgeModeRaw = process.env.PUB_DAEMON_BRIDGE_MODE;
  if (!bridgeModeRaw) {
    console.error("Missing PUB_DAEMON_BRIDGE_MODE env var.");
    process.exit(1);
  }
  const bridgeMode = bridgeModeRaw as BridgeMode;

  if (!baseUrl || !apiKey || !socketPath || !infoPath) {
    console.error("Missing required env vars for daemon.");
    process.exit(1);
  }

  const apiClient = new PubApiClient(baseUrl, apiKey);
  await startDaemon({ apiClient, socketPath, infoPath, cliVersion, bridgeMode, agentName });
}
