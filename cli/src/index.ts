#!/usr/bin/env node
import { Command } from "commander";
import { registerConfigureCommand } from "./commands/configure.js";
import { registerPublicationCommands } from "./commands/publications.js";
import { registerTunnelCommands } from "./commands/tunnel.js";

const program = new Command();

program
  .name("pubblue")
  .description("Publish static content and get shareable URLs")
  .version("0.4.10");

registerConfigureCommand(program);
registerPublicationCommands(program);
registerTunnelCommands(program);

program.parse();
