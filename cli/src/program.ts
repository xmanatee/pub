import { Command } from "commander";
import { registerConfigCommand } from "./commands/config.js";
import { registerLiveCommands } from "./commands/live.js";
import { registerPubCommands } from "./commands/pubs.js";
import { registerUpgradeCommand } from "./commands/upgrade.js";
import { CLI_VERSION } from "./lib/version.js";

export function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();

  program.name("pub").description("Publish content and go live").version(CLI_VERSION);

  registerConfigCommand(program);
  registerPubCommands(program);
  registerLiveCommands(program);
  registerUpgradeCommand(program);

  return program;
}
