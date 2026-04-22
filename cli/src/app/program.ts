import { Command } from "commander";
import { registerChannelServerCommand } from "../commands/channel-server.js";
import { registerCommitCommand } from "../commands/commit.js";
import { registerConfigCommand } from "../commands/config/index.js";
import { registerLiveCommands } from "../commands/live/index.js";
import { registerPubCommands } from "../commands/pub/index.js";
import { registerUpgradeCommand } from "../commands/upgrade/index.js";
import { CLI_VERSION } from "../core/version/version.js";

export function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();

  program
    .name("pub")
    .description("Adaptive interfaces, powered by your agent")
    .version(CLI_VERSION);

  registerConfigCommand(program);
  registerPubCommands(program);
  registerLiveCommands(program);
  registerCommitCommand(program);
  registerUpgradeCommand(program);
  registerChannelServerCommand(program);

  return program;
}
