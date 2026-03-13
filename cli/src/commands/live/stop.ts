import type { Command } from "commander";
import { stopRecordedDaemons } from "../../live/runtime/daemon-process.js";

export function registerStopCommand(program: Command): void {
  program
    .command("stop")
    .description("Stop the agent daemon (deregisters presence, closes active live)")
    .action(async () => {
      const stoppedCount = await stopRecordedDaemons();
      if (stoppedCount === 0) {
        console.log("Agent daemon is not running.");
        return;
      }

      console.log("Agent daemon stopped.");
    });
}
