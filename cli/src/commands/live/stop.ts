import type { Command } from "commander";
import { isDaemonRunning, stopOtherDaemons } from "../../live/runtime/daemon-process.js";

export function registerStopCommand(program: Command): void {
  program
    .command("stop")
    .description("Stop the agent daemon (deregisters presence, closes active live)")
    .action(async () => {
      if (!isDaemonRunning("agent")) {
        console.log("Agent daemon is not running.");
        return;
      }

      await stopOtherDaemons();
      console.log("Agent daemon stopped.");
    });
}
