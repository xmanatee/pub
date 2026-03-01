import { Command } from "commander";
import { registerConfigureCommand } from "./commands/configure.js";
import { registerLiveCommands } from "./commands/live.js";
import { registerPubCommands } from "./commands/pubs.js";
import { CLI_VERSION } from "./lib/version.js";

export function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();

  program.name("pubblue").description("Publish content and go live").version(CLI_VERSION);

  registerConfigureCommand(program);
  registerPubCommands(program);
  registerLiveCommands(program);

  return program;
}
