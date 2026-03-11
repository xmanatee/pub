#!/usr/bin/env node
import "reflect-metadata";

if (process.env.PUB_DAEMON_MODE === "1") {
  const { runDaemonFromEnv } = await import("./app/live-daemon-entry.js");
  await runDaemonFromEnv();
} else {
  const { toCliFailure } = await import("./core/errors/cli-error.js");
  const { buildProgram } = await import("./app/program.js");
  const { CLI_VERSION } = await import("./core/version/version.js");
  const { getUpdateCheck } = await import("./core/version/version-check.js");

  const skipUpdateCheck = process.env.PUB_SKIP_UPDATE_CHECK === "1";
  const updateCheck = skipUpdateCheck ? null : await getUpdateCheck();

  const program = buildProgram();

  program.hook("preAction", (_, actionCommand) => {
    if (updateCheck?.requiresUpgrade && actionCommand.name() !== "upgrade") {
      console.error(
        `pub v${CLI_VERSION} is outdated. v${updateCheck.latest} requires an upgrade.\nRun \`pub upgrade\` to update.`,
      );
      process.exit(1);
    }
  });

  program.hook("postAction", (_, actionCommand) => {
    if (updateCheck?.updateAvailable && !updateCheck.requiresUpgrade && actionCommand.name() !== "upgrade") {
      console.error(
        `\nUpdate available: v${updateCheck.latest} (current: v${CLI_VERSION}). Run \`pub upgrade\` to update.`,
      );
    }
  });

  await program.parseAsync(process.argv).catch((error: unknown) => {
    const failure = toCliFailure(error);
    if (failure.message) {
      console.error(failure.message);
    }
    process.exit(failure.exitCode);
  });
}
