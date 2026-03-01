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
      "close",
      "configure",
      "create",
      "delete",
      "doctor",
      "get",
      "list",
      "open",
      "read",
      "status",
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

  it("keeps open bridge/foreground options", () => {
    const openCommand = requireCommand("open");
    const optionFlags = openCommand.options.map((option) => option.long);
    expect(optionFlags).toContain("--bridge");
    expect(optionFlags).toContain("--foreground");
    expect(optionFlags).toContain("--new");
  });
});
