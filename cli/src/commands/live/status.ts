import type { Command } from "commander";
import { errorMessage, failCli } from "../../core/errors/cli-error.js";
import { type StatusResponse } from "../../live/transport/ipc-protocol.js";
import { getAgentSocketPath, ipcCall } from "../../live/transport/ipc.js";
import {
  getConfiguredLiveDebugState,
  printDaemonStatus,
  printLocalRuntimeSummary,
} from "./support.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Check agent daemon and live connection status")
    .action(async () => {
      const socketPath = getAgentSocketPath();
      let liveDebug: { enabled: boolean } | null = null;
      let liveDebugError: string | null = null;
      try {
        liveDebug = getConfiguredLiveDebugState();
      } catch (error) {
        liveDebugError = errorMessage(error);
      }
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

      printDaemonStatus(response, { debugEnabled: liveDebug?.enabled ?? null });
      if (liveDebugError) {
        console.log(`  Debug config unavailable: ${liveDebugError}`);
      }
    });
}
