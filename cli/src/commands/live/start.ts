import * as fs from "node:fs";
import type { Command } from "commander";
import { errorMessage, failCli } from "../../core/errors/cli-error.js";
import { CLI_VERSION } from "../../core/version/version.js";
import { getAgentSocketPath } from "../../live/transport/ipc.js";
import {
  liveInfoPath,
  liveLogPath,
  readLogTail,
  writeLatestCliVersion,
} from "../../live/runtime/daemon-files.js";
import { buildDaemonSpawnStdio, waitForDaemonReady } from "../../live/runtime/daemon-process.js";
import { runStartPreflight } from "../../live/runtime/start-preflight.js";

export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start the agent daemon (registers presence, awaits live requests)")
    .requiredOption("--agent-name <name>", "Agent display name shown to the browser user")
    .option("--bridge <mode>", "Bridge mode: openclaw|claude-code|claude-sdk")
    .action(async (opts: { agentName: string; bridge?: string }) => {
      const preflight = await runStartPreflight({ bridge: opts.bridge });
      const { runtimeConfig, bridgeConfig, bridgeMode, bridgeProcessEnv } = preflight;
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
      const logPath = liveLogPath("agent");

      const { spawn } = await import("node:child_process");
      const daemonLogFd = fs.openSync(logPath, "a");
      const child = spawn(process.execPath, [], {
        detached: true,
        stdio: buildDaemonSpawnStdio(daemonLogFd),
        env: {
          ...bridgeProcessEnv,
          PUB_DAEMON_MODE: "1",
          PUB_DAEMON_API_BASE_URL: runtimeConfig.baseUrl,
          PUB_DAEMON_API_KEY: runtimeConfig.apiKey,
          PUB_DAEMON_SOCKET: socketPath,
          PUB_DAEMON_INFO: infoPath,
          PUB_DAEMON_AGENT_NAME: opts.agentName,
          PUB_CLI_VERSION: CLI_VERSION,
          PUB_DAEMON_BRIDGE_MODE: bridgeMode,
          PUB_DAEMON_BRIDGE_CONFIG: JSON.stringify(bridgeConfig),
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
        failCli(lines.join("\n"));
      }

      console.log("Agent daemon started. Waiting for browser to initiate live.");
      console.log(`Daemon log: ${logPath}`);
      console.log(`Bridge mode: ${bridgeMode}`);
    });
}
