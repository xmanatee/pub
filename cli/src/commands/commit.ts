import type { Command } from "commander";
import { resolvePubSettings } from "../core/config/index.js";
import { failCli } from "../core/errors/cli-error.js";
import { resolvePubPaths } from "../core/paths.js";
import { DEFAULT_COMMIT_STEPS, runSuperAppCommit } from "../super-app/commit.js";
import {
  detectPackageManager,
  getSuperAppDir,
  isSuperAppInitialized,
} from "../super-app/workspace.js";
import { createCliCommandContext } from "./shared/index.js";

export function registerCommitCommand(program: Command): void {
  program
    .command("commit <message>")
    .description(
      "Validate super-app changes. Invokes the declared npm scripts " +
        `(${DEFAULT_COMMIT_STEPS.map((s) => s.script).join(", ")}) in order; ` +
        "fails on the first script that exits non-zero.",
    )
    .action((message: string) => {
      const context = createCliCommandContext();
      const resolved = resolvePubSettings(context.env);
      const dir = getSuperAppDir(
        resolved.rawConfig.tunnel,
        resolvePubPaths(context.env).workspaceRoot,
      );

      if (!isSuperAppInitialized(dir)) {
        failCli(`super-app not initialized at ${dir}. Run \`pub start\` first.`);
      }

      console.log(`Validating super-app at ${dir}`);
      const outcomes = runSuperAppCommit({
        dir,
        packageManager: detectPackageManager(),
        steps: DEFAULT_COMMIT_STEPS,
      });
      const failure = outcomes.find(
        (outcome): outcome is Extract<typeof outcome, { status: "failed" }> =>
          outcome.status === "failed",
      );
      if (failure) {
        failCli(
          `[${failure.script}] failed (exit ${failure.exitCode}). ` +
            `Fix the issues above and rerun \`pub commit "${message}"\`.`,
        );
      }
      console.log(`\nOK: ${message}`);
    });
}
