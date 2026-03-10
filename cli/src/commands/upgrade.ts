import type { Command } from "commander";
import {
  detectTarget,
  downloadAndReplace,
  fetchLatestRelease,
  isNewer,
} from "../lib/self-update.js";
import { CLI_VERSION } from "../lib/version.js";

export function registerUpgradeCommand(program: Command): void {
  program
    .command("upgrade")
    .description("Check for updates and self-update the binary")
    .option("--check", "Only check if an update is available")
    .action(async (opts: { check?: boolean }) => {
      const latest = await fetchLatestRelease();

      if (!isNewer(latest.version, CLI_VERSION)) {
        console.log(`Already up to date (v${CLI_VERSION}).`);
        return;
      }

      console.log(`New version available: v${latest.version} (current: v${CLI_VERSION})`);

      if (opts.check) return;

      const target = detectTarget();
      console.log(`Downloading pub-${target}...`);
      await downloadAndReplace(latest.tag, target);
      console.log(`Updated to v${latest.version}.`);
    });
}
