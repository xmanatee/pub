/**
 * Global teardown for full-stack E2E tests.
 *
 * Cleans up everything that might survive a crashed test run:
 *  1. Kill stale pub daemon processes
 *  2. Remove socket files
 *  3. Remove temp config directories
 *  4. Remove state file
 */
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanupSocketFiles, cleanupTempConfigDirs, killStaleDaemons } from "./helpers/cleanup";

const STATE_FILE = join(tmpdir(), "pub-e2e-state.json");

export default async function globalTeardown() {
  console.log("[e2e] Running global teardown...");

  killStaleDaemons();
  cleanupSocketFiles();
  cleanupTempConfigDirs();

  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }

  console.log("[e2e] Global teardown complete.");
}
