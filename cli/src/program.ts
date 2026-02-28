import { Command } from "commander";
import { registerConfigureCommand } from "./commands/configure.js";
import { registerPublicationCommands } from "./commands/publications.js";
import { registerTunnelCommands } from "./commands/tunnel.js";
import { CLI_VERSION } from "./lib/version.js";

export function buildProgram(): Command {
  const program = new Command();
  program.exitOverride();

  program
    .name("pubblue")
    .description("Publish static content and get shareable URLs")
    .version(CLI_VERSION);

  registerConfigureCommand(program);
  registerPublicationCommands(program);
  registerTunnelCommands(program);

  return program;
}
