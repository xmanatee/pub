import type { Command } from "commander";
import { CHANNELS } from "../../../../shared/bridge-protocol-core";
import { getFollowReadDelayMs } from "../../live/runtime/command-utils.js";
import { getAgentSocketPath, ipcCall } from "../../live/transport/ipc.js";

export function registerReadCommand(program: Command): void {
  program
    .command("read")
    .description("Read buffered messages from live channels (debug only)")
    .option("-c, --channel <channel>", "Filter by channel")
    .option("--follow", "Stream messages continuously")
    .option("--all", "With --follow, include all channels instead of chat-only default")
    .action(async (opts: { channel?: string; follow?: boolean; all?: boolean }) => {
      const socketPath = getAgentSocketPath();
      const readChannel = opts.channel || (opts.follow && !opts.all ? CHANNELS.CHAT : undefined);

      if (!opts.follow) {
        const response = await ipcCall(socketPath, {
          method: "read",
          params: { channel: readChannel },
        });
        if (!response.ok) {
          throw new Error(`Failed: ${response.error}`);
        }
        console.log(JSON.stringify(response.messages || [], null, 2));
        return;
      }

      if (!opts.channel && !opts.all) {
        console.error("Following chat channel by default. Use `--all` to include binary/file channels.");
      }

      let consecutiveFailures = 0;
      let warnedDisconnected = false;

      while (true) {
        try {
          const response = await ipcCall(socketPath, {
            method: "read",
            params: { channel: readChannel },
          });

          if (warnedDisconnected) {
            console.error("Daemon reconnected.");
            warnedDisconnected = false;
          }

          consecutiveFailures = 0;
          if (response.messages && response.messages.length > 0) {
            for (const message of response.messages) {
              console.log(JSON.stringify(message));
            }
          }
        } catch (error) {
          consecutiveFailures += 1;
          if (!warnedDisconnected) {
            const detail = error instanceof Error ? ` ${error.message}` : "";
            console.error(`Daemon disconnected. Waiting for recovery...${detail}`);
            warnedDisconnected = true;
          }
        }

        const delayMs = getFollowReadDelayMs(warnedDisconnected, consecutiveFailures);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    });
}
