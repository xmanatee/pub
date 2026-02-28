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
    expect(names).toEqual(["configure", "create", "delete", "get", "list", "tunnel", "update"]);
  });

  it("keeps create visibility/title options", () => {
    const createCommand = requireCommand("create");
    const optionFlags = createCommand.options.map((option) => option.long);
    expect(optionFlags).toContain("--title");
    expect(optionFlags).toContain("--public");
    expect(optionFlags).toContain("--private");
  });

  it("keeps tunnel start bridge/foreground options", () => {
    const tunnelCommand = requireCommand("tunnel");
    const startCommand = tunnelCommand.commands.find((entry) => entry.name() === "start");
    if (!startCommand) {
      throw new Error("expected tunnel start command");
    }

    const optionFlags = startCommand.options.map((option) => option.long);
    expect(optionFlags).toContain("--bridge");
    expect(optionFlags).toContain("--foreground");
    expect(optionFlags).toContain("--tunnel");
    expect(optionFlags).toContain("--new");
  });
});
