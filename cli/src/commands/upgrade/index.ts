import type { Command } from "commander";
import { errorMessage, failCli } from "../../core/errors/cli-error.js";
import {
  detectTarget,
  downloadAndReplace,
  fetchLatestRelease,
  isNewer,
} from "../../core/version/self-update.js";
import { CLI_VERSION } from "../../core/version/version.js";

export function registerUpgradeCommand(program: Command): void {
  program
    .command("upgrade")
    .description("Check for updates and self-update the binary")
    .option("--check", "Only check if an update is available")
    .action(async (opts: { check?: boolean }) => {
      let latest: { version: string; tag: string };
      try {
        latest = await fetchLatestRelease();
      } catch (error) {
        failCli(`Failed to check for updates: ${errorMessage(error)}`);
      }

      if (!isNewer(latest.version, CLI_VERSION)) {
        console.log(`Already up to date (v${CLI_VERSION}).`);
        return;
      }

      console.log(`New version available: v${latest.version} (current: v${CLI_VERSION})`);

      if (opts.check) return;

      const target = detectTarget();
      console.log(`Downloading pub-${target}...`);
      try {
        await downloadAndReplace(latest.tag, target);
      } catch (error) {
        failCli(`Upgrade failed: ${errorMessage(error)}`);
      }
      console.log(`Updated to v${latest.version}.`);
    });
}
