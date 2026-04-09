import { PubApiClient } from "../core/api/client.js";
import type { BridgeSettings } from "../core/config/index.js";
import { errorMessage } from "../core/errors/cli-error.js";
import { exitProcess } from "../core/process/exit.js";
import { initSentryCli } from "../core/telemetry/sentry.js";
import { startDaemon } from "../live/daemon/index.js";

export async function runDaemonFromEnv(): Promise<void> {
  const sentryDsn = process.env.PUB_SENTRY_DSN;
  const cliVersion = process.env.PUB_CLI_VERSION;
  const telemetryDisabled = process.env.PUB_TELEMETRY === "false" || process.env.PUB_TELEMETRY === "0";
  if (sentryDsn && !telemetryDisabled) {
    initSentryCli({ dsn: sentryDsn, version: cliVersion });
  }

  const baseUrl = process.env.PUB_DAEMON_API_BASE_URL;
  const apiKey = process.env.PUB_DAEMON_API_KEY;
  const socketPath = process.env.PUB_DAEMON_SOCKET;
  const infoPath = process.env.PUB_DAEMON_INFO;
  const logPath = process.env.PUB_DAEMON_LOG;
  const agentName = process.env.PUB_DAEMON_AGENT_NAME;
  const bridgeSettingsRaw = process.env.PUB_DAEMON_BRIDGE_SETTINGS;
  if (!bridgeSettingsRaw?.trim()) {
    console.error("Missing PUB_DAEMON_BRIDGE_SETTINGS env var.");
    return exitProcess(1);
  }
  let bridgeSettings: BridgeSettings;
  try {
    bridgeSettings = JSON.parse(bridgeSettingsRaw) as BridgeSettings;
  } catch (error) {
    console.error(`Invalid PUB_DAEMON_BRIDGE_SETTINGS env var: ${errorMessage(error)}`);
    return exitProcess(1);
  }

  if (!baseUrl || !apiKey || !socketPath || !infoPath) {
    console.error("Missing required env vars for daemon.");
    return exitProcess(1);
  }

  const tunnelConfigRaw = process.env.PUB_DAEMON_TUNNEL_CONFIG;
  const tunnelConfig = tunnelConfigRaw ? JSON.parse(tunnelConfigRaw) : undefined;

  const apiClient = new PubApiClient(baseUrl, apiKey);
  await startDaemon({
    apiClient,
    socketPath,
    infoPath,
    logPath,
    cliVersion,
    bridgeSettings,
    agentName,
    tunnelConfig,
  });
}
