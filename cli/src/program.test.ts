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
      "channels",
      "configure",
      "create",
      "delete",
      "doctor",
      "get",
      "list",
      "read",
      "start",
      "status",
      "stop",
      "update",
      "write",
    ]);
  });

  it("keeps create visibility/title options", () => {
    const createCommand = requireCommand("create");
    const optionFlags = createCommand.options.map((option) => option.long);
    expect(optionFlags).toContain("--title");
    expect(optionFlags).toContain("--public");
    expect(optionFlags).toContain("--private");
  });

  it("keeps start agent-name/bridge options", () => {
    const startCommand = requireCommand("start");
    const optionFlags = startCommand.options.map((option) => option.long);
    expect(optionFlags).toContain("--agent-name");
    expect(optionFlags).toContain("--bridge");
  });
});
