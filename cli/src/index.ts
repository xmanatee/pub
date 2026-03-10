#!/usr/bin/env node
export {};

if (process.env.PUBBLUE_DAEMON_MODE === "1") {
  const { runDaemonFromEnv } = await import("./live-daemon-entry.js");
  await runDaemonFromEnv();
} else {
  const { toCliFailure } = await import("./lib/cli-error.js");
  const { buildProgram } = await import("./program.js");
  const { CLI_VERSION } = await import("./lib/version.js");
  const { getUpdateCheck } = await import("./lib/version-check.js");

  const updateCheck = await getUpdateCheck();
  const command = process.argv[2];
  const isGated = command !== "upgrade" && command !== "--version" && command !== "-V";

  if (updateCheck?.requiresUpgrade && isGated) {
    console.error(
      `pubblue v${CLI_VERSION} is outdated. v${updateCheck.latest} requires an upgrade.\nRun \`pubblue upgrade\` to update.`,
    );
    process.exit(1);
  }

  const program = buildProgram();

  await program.parseAsync(process.argv).catch((error: unknown) => {
    const failure = toCliFailure(error);
    if (failure.message) {
      console.error(failure.message);
    }
    process.exit(failure.exitCode);
  });

  if (updateCheck?.updateAvailable && !updateCheck.requiresUpgrade) {
    console.error(
      `\nUpdate available: v${updateCheck.latest} (current: v${CLI_VERSION}). Run \`pubblue upgrade\` to update.`,
    );
  }
}
