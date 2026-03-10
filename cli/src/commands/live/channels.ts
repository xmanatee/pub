import type { Command } from "commander";
import { getAgentSocketPath, ipcCall } from "../../live/transport/ipc.js";

export function registerChannelsCommand(program: Command): void {
  program
    .command("channels")
    .description("List active live channels")
    .action(async () => {
      const socketPath = getAgentSocketPath();
      const response = await ipcCall(socketPath, { method: "channels", params: {} });
      if (response.channels) {
        for (const channel of response.channels as Array<{ name: string; direction: string }>) {
          console.log(`  ${channel.name}  [${channel.direction}]`);
        }
      }
    });
}
