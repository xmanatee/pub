import { CommanderError } from "commander";

class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function failCli(message: string, exitCode = 1): never {
  throw new CliError(message, exitCode);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toCliFailure(error: unknown): { exitCode: number; message: string } {
  if (error instanceof CommanderError) {
    return {
      exitCode: error.exitCode,
      message: "",
    };
  }

  if (error instanceof CliError) {
    return {
      exitCode: error.exitCode,
      message: error.message,
    };
  }

  return {
    exitCode: 1,
    message: errorMessage(error),
  };
}
