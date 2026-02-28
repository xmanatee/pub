import { CommanderError } from "commander";

export class CliError extends Error {
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

  if (error instanceof Error) {
    return {
      exitCode: 1,
      message: error.message,
    };
  }

  return {
    exitCode: 1,
    message: String(error),
  };
}
