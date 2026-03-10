import { PubApiClient } from "./lib/api.js";
import { startDaemon } from "./lib/live-daemon.js";
import type { BridgeMode } from "./lib/live-daemon-shared.js";

export async function runDaemonFromEnv(): Promise<void> {
  const baseUrl = process.env.PUBBLUE_DAEMON_BASE_URL;
  const apiKey = process.env.PUBBLUE_DAEMON_API_KEY;
  const socketPath = process.env.PUBBLUE_DAEMON_SOCKET;
  const infoPath = process.env.PUBBLUE_DAEMON_INFO;
  const cliVersion = process.env.PUBBLUE_CLI_VERSION;
  const agentName = process.env.PUBBLUE_DAEMON_AGENT_NAME;
  const bridgeModeRaw = process.env.PUBBLUE_DAEMON_BRIDGE_MODE;
  if (!bridgeModeRaw) {
    console.error("Missing PUBBLUE_DAEMON_BRIDGE_MODE env var.");
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
