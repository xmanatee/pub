import type { Command } from "commander";
import { errorMessage, failCli } from "../../core/errors/cli-error.js";
import { DaemonUnavailableError } from "../../live/transport/ipc.js";
import { createCliCommandContext } from "../shared/index.js";
import {
  getConfiguredLiveVerboseState,
  printDaemonStatus,
  printLocalRuntimeSummary,
} from "./support.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Check agent daemon and live connection status")
    .action(async () => {
      const context = createCliCommandContext();
      let liveVerbose: { enabled: boolean } | null = null;
      let liveVerboseError: string | null = null;
      try {
        liveVerbose = getConfiguredLiveVerboseState(context.env);
      } catch (error) {
        liveVerboseError = errorMessage(error);
      }
      const response = await context
        .callDaemon({ method: "status", params: {} })
        .catch((error: unknown) => {
          if (error instanceof DaemonUnavailableError) {
            console.log("Agent daemon is not running.");
            printLocalRuntimeSummary(context.env);
            return null;
          }
          failCli(`Failed to fetch daemon status: ${errorMessage(error)}`);
        });
      if (!response) return;
      if (!response.ok) {
        failCli(`Failed to fetch daemon status: ${response.error}`);
      }

      printDaemonStatus(response, { verboseEnabled: liveVerbose?.enabled ?? null });
      if (liveVerboseError) {
        console.log(`  Verbose config unavailable: ${liveVerboseError}`);
      }
    });
}
