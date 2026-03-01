import { Command } from "commander";
import { registerConfigureCommand } from "./commands/configure.js";
import { registerPubCommands } from "./commands/pubs.js";
import { registerSessionCommands } from "./commands/session.js";
import { CLI_VERSION } from "./lib/version.js";

export function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();

  program
    .name("pubblue")
    .description("Publish content and run interactive sessions")
    .version(CLI_VERSION);

  registerConfigureCommand(program);
  registerPubCommands(program);
  registerSessionCommands(program);

  return program;
}
