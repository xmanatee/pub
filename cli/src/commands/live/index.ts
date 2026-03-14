import type { Command } from "commander";
import { registerDoctorCommand } from "./doctor.js";
import { registerStartCommand } from "./start.js";
import { registerStatusCommand } from "./status.js";
import { registerStopCommand } from "./stop.js";
import { registerWriteCommand } from "./write.js";

export function registerLiveCommands(program: Command): void {
  registerStartCommand(program);
  registerStopCommand(program);
  registerStatusCommand(program);
  registerWriteCommand(program);
  registerDoctorCommand(program);
}
