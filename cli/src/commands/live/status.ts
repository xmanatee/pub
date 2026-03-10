import * as fs from "node:fs";
import type { Command } from "commander";
import { errorMessage, failCli } from "../../core/errors/cli-error.js";
import { liveLogPath } from "../../live/runtime/daemon-files.js";
import { type StatusResponse } from "../../live/transport/ipc-protocol.js";
import { getAgentSocketPath, ipcCall } from "../../live/transport/ipc.js";
import { printLocalRuntimeSummary } from "./support.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Check agent daemon and live connection status")
    .action(async () => {
      const socketPath = getAgentSocketPath();
      let response: StatusResponse;
      try {
        response = await ipcCall(socketPath, { method: "status", params: {} });
      } catch (error) {
        if (errorMessage(error) !== "Daemon not running.") {
          failCli(`Failed to fetch daemon status: ${errorMessage(error)}`);
        }
        console.log("Agent daemon is not running.");
        printLocalRuntimeSummary();
        return;
      }
      if (!response.ok) {
        failCli(`Failed to fetch daemon status: ${response.error || "unknown error"}`);
      }

      console.log(`  Daemon: running`);
      console.log(`  Active slug: ${response.activeSlug || "(none)"}`);
      console.log(`  Status: ${response.connected ? "connected" : "waiting"}`);
      if (typeof response.signalingConnected === "boolean") {
        console.log(`  Signaling: ${response.signalingConnected ? "connected" : "reconnecting"}`);
      }
      console.log(`  Uptime: ${response.uptime}s`);
      console.log(`  Channels: ${response.channels.join(", ") || "(none)"}`);
      console.log(`  Buffered: ${response.bufferedMessages ?? 0} messages`);
      if (typeof response.lastError === "string" && response.lastError.length > 0) {
        console.log(`  Last error: ${response.lastError}`);
      }
      const logPath = liveLogPath("agent");
      if (fs.existsSync(logPath)) {
        console.log(`  Log: ${logPath}`);
      }
      const bridge = response.bridge;
      if (bridge) {
        const bridgeLabel = response.bridgeMode ?? "unknown";
        console.log(`  Bridge: ${bridgeLabel} (${bridge.running ? "running" : "stopped"})`);
        if (bridge.sessionId) {
          console.log(`  Bridge session: ${bridge.sessionId}`);
        }
        if (bridge.sessionSource) {
          console.log(`  Bridge session source: ${bridge.sessionSource}`);
        }
        if (bridge.sessionKey) {
          console.log(`  Bridge session key: ${bridge.sessionKey}`);
        }
        if (bridge.forwardedMessages !== undefined) {
          console.log(`  Bridge forwarded: ${bridge.forwardedMessages} messages`);
        }
        if (bridge.lastError) {
          console.log(`  Bridge last error: ${bridge.lastError}`);
        }
      }
    });
}
