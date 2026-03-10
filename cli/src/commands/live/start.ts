import * as fs from "node:fs";
import type { Command } from "commander";
import { errorMessage, failCli } from "../../core/errors/cli-error.js";
import { CLI_VERSION } from "../../core/version/version.js";
import { getAgentSocketPath, ipcCall } from "../../live/transport/ipc.js";
import {
  liveInfoPath,
  liveLogPath,
  readLogTail,
  writeLatestCliVersion,
} from "../../live/runtime/daemon-files.js";
import { buildDaemonSpawnStdio, waitForDaemonReady } from "../../live/runtime/daemon-process.js";
import { runStartPreflight } from "../../live/runtime/start-preflight.js";
import {
  getLiveVerboseEnableCommand,
  printDaemonStatus,
} from "./support.js";

export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start the agent daemon (registers presence, awaits live requests)")
    .requiredOption("--agent-name <name>", "Agent display name shown to the browser user")
    .action(async (opts: { agentName: string }) => {
      const preflight = await runStartPreflight();
      const { apiClientSettings, bridgeSettings, bridgeProcessEnv } = preflight;
      try {
        writeLatestCliVersion(CLI_VERSION);
      } catch (error) {
        failCli(`Failed to write CLI runtime metadata: ${errorMessage(error)}`);
      }

      console.log("Preflight checks passed:");
      for (const line of preflight.passedChecks) {
        console.log(`  ${line}`);
      }

      const socketPath = getAgentSocketPath();
      const infoPath = liveInfoPath("agent");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
      const logPath = liveLogPath(`agent-${ts}`);

      const { spawn } = await import("node:child_process");
      const daemonLogFd = fs.openSync(logPath, "a");
      const child = spawn(process.execPath, [], {
        detached: true,
        stdio: buildDaemonSpawnStdio(daemonLogFd),
        env: {
          ...bridgeProcessEnv,
          PUB_DAEMON_MODE: "1",
          PUB_DAEMON_API_BASE_URL: apiClientSettings.baseUrl,
          PUB_DAEMON_API_KEY: apiClientSettings.apiKey,
          PUB_DAEMON_SOCKET: socketPath,
          PUB_DAEMON_INFO: infoPath,
          PUB_DAEMON_AGENT_NAME: opts.agentName,
          PUB_CLI_VERSION: CLI_VERSION,
          PUB_DAEMON_BRIDGE_SETTINGS: JSON.stringify(bridgeSettings),
          PUB_DAEMON_LOG: logPath,
        },
      });
      fs.closeSync(daemonLogFd);
      child.unref();

      console.log("Starting agent daemon...");
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
        let tail: string | null = null;
        try {
          tail = readLogTail(logPath);
        } catch (error) {
          lines.push(`Failed to read daemon log tail: ${errorMessage(error)}`);
        }
        if (tail) {
          lines.push("---- daemon log tail ----");
          lines.push(tail.trimEnd());
          lines.push("---- end daemon log tail ----");
        }
        lines.push("");
        lines.push("Troubleshooting:");
        lines.push("- Inspect the daemon log path above.");
        if (bridgeSettings.verbose) {
          lines.push("- Verbose daemon logging is already enabled; retry and check the log again.");
        } else {
          lines.push(
            `- Enable verbose daemon logging and retry: \`${getLiveVerboseEnableCommand()}\``,
          );
        }
        failCli(lines.join("\n"));
      }

      console.log("Agent daemon started. Waiting for browser to initiate live.");
      let startupStatusError: string | null = null;
      try {
        const status = await ipcCall(socketPath, { method: "status", params: {} });
        if (status.ok) {
          console.log("");
          console.log("Current status:");
          printDaemonStatus(status, { verboseEnabled: bridgeSettings.verbose });
        } else {
          startupStatusError = status.error || "unknown error";
        }
      } catch (error) {
        startupStatusError = errorMessage(error);
      }
      if (startupStatusError) {
        console.log(`Status fetch failed after startup: ${startupStatusError}`);
        console.log(`Bridge mode: ${bridgeSettings.mode}`);
        console.log(`Verbose logging: ${bridgeSettings.verbose ? "enabled" : "disabled"}`);
        console.log(`Log: ${logPath}`);
        console.log("Run `pub status` for a fresh status check.");
      }
    });
}
