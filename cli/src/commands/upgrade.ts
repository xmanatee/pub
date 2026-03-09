import type { Command } from "commander";
import { failCli } from "../lib/cli-error.js";
import {
  detectTarget,
  downloadAndReplace,
  fetchLatestRelease,
  isBinaryInstall,
  isNewer,
} from "../lib/self-update.js";
import { CLI_VERSION } from "../lib/version.js";

export function registerUpgradeCommand(program: Command): void {
  program
    .command("upgrade")
    .description("Check for updates and self-update the binary")
    .option("--check", "Only check if an update is available")
    .action(async (opts: { check?: boolean }) => {
      if (!isBinaryInstall()) {
        failCli("Self-update is only available for standalone binaries.\nUse `npm update -g pubblue` or `pnpm update -g pubblue` instead.");
      }

      const latest = await fetchLatestRelease();

      if (!isNewer(latest.version, CLI_VERSION)) {
        console.log(`Already up to date (v${CLI_VERSION}).`);
        return;
      }

      console.log(`New version available: v${latest.version} (current: v${CLI_VERSION})`);

      if (opts.check) return;

      const target = detectTarget();
      console.log(`Downloading pubblue-${target}...`);
      await downloadAndReplace(latest.tag, target);
      console.log(`Updated to v${latest.version}.`);
    });
}
