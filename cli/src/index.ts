#!/usr/bin/env node
import { toCliFailure } from "./lib/cli-error.js";
import { buildProgram } from "./program.js";

const program = buildProgram();

await program.parseAsync(process.argv).catch((error: unknown) => {
  const failure = toCliFailure(error);
  if (failure.message) {
    console.error(failure.message);
  }
  process.exit(failure.exitCode);
});
