import type { Command } from "commander";

export function registerChannelServerCommand(program: Command): void {
  program
    .command("channel-server")
    .description("Start the MCP channel server for Claude Code integration")
    .option("--socket-path <path>", "Override relay socket path")
    .action(async (opts: { socketPath?: string }) => {
      const { startChannelServer } = await import("../channel-server/index.js");
      await startChannelServer({ socketPath: opts.socketPath });
    });
}
