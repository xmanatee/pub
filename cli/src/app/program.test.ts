import { describe, expect, it } from "vitest";
import { buildProgram } from "./program.js";

function requireCommand(name: string) {
  const program = buildProgram();
  const command = program.commands.find((entry) => entry.name() === name);
  if (!command) {
    throw new Error(`expected command '${name}'`);
  }
  return command;
}

describe("CLI command surface", () => {
  it("registers top-level commands", () => {
    const program = buildProgram();
    const names = program.commands.map((command) => command.name()).sort();
    expect(names).toEqual([
      "channel-server",
      "commit",
      "config",
      "create",
      "delete",
      "doctor",
      "get",
      "list",
      "start",
      "status",
      "stop",
      "update",
      "upgrade",
      "write",
    ]);
  });

  it("keeps create slug option", () => {
    const createCommand = requireCommand("create");
    const optionFlags = createCommand.options.map((option) => option.long);
    expect(optionFlags).toContain("--slug");
  });

  it("keeps start agent-name option", () => {
    const startCommand = requireCommand("start");
    const optionFlags = startCommand.options.map((option) => option.long);
    expect(optionFlags).toContain("--agent-name");
    expect(optionFlags).not.toContain("--bridge");
  });
});
