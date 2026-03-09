#!/usr/bin/env node
export {};

if (process.env.PUBBLUE_DAEMON_MODE === "1") {
  const { runDaemonFromEnv } = await import("./live-daemon-entry.js");
  await runDaemonFromEnv();
} else {
  const { toCliFailure } = await import("./lib/cli-error.js");
  const { buildProgram } = await import("./program.js");

  const program = buildProgram();

  await program.parseAsync(process.argv).catch((error: unknown) => {
    const failure = toCliFailure(error);
    if (failure.message) {
      console.error(failure.message);
    }
    process.exit(failure.exitCode);
  });
}
