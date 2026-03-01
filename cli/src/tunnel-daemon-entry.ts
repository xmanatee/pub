/**
 * Daemon entry point — forked by `pubblue open`.
 * Reads config from env vars and starts the daemon.
 */

import { PubApiClient } from "./lib/api.js";
import { startDaemon } from "./lib/tunnel-daemon.js";

const slug = process.env.PUBBLUE_DAEMON_SLUG;
const baseUrl = process.env.PUBBLUE_DAEMON_BASE_URL;
const apiKey = process.env.PUBBLUE_DAEMON_API_KEY;
const socketPath = process.env.PUBBLUE_DAEMON_SOCKET;
const infoPath = process.env.PUBBLUE_DAEMON_INFO;
const cliVersion = process.env.PUBBLUE_CLI_VERSION;

if (!slug || !baseUrl || !apiKey || !socketPath || !infoPath) {
  console.error("Missing required env vars for daemon.");
  process.exit(1);
}

const apiClient = new PubApiClient(baseUrl, apiKey);
void startDaemon({ slug, apiClient, socketPath, infoPath, cliVersion }).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Session daemon failed to start: ${message}`);
  process.exit(1);
});
