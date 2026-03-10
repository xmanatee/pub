import type { Command } from "commander";
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
        console.error(`Failed to check for updates: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
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
        console.error(`Upgrade failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
      console.log(`Updated to v${latest.version}.`);
    });
}
