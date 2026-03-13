import type { Command } from "commander";
import { createCliCommandContext } from "../shared/index.js";

export function registerChannelsCommand(program: Command): void {
  program
    .command("channels")
    .description("List active live channels")
    .action(async () => {
      const context = createCliCommandContext();
      const response = await context.requireDaemonResponse(
        { method: "channels", params: {} },
        "Failed to list daemon channels",
      );
      if ((response.channels?.length ?? 0) === 0) {
        console.log("No active channels.");
        return;
      }
      for (const channel of response.channels ?? []) {
        console.log(`  ${channel.name}  [${channel.direction}]`);
      }
    });
}
