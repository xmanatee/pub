/**
 * Global teardown for full-stack E2E tests.
 *
 * Cleans up temp resources that survived the test run:
 *  1. Remove stale socket files
 *  2. Remove temp config directories
 *  3. Remove state file
 */
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanupSocketFiles, cleanupTempConfigDirs } from "./helpers/cleanup";

const STATE_FILE = join(tmpdir(), "pub-e2e-state.json");

export default async function globalTeardown() {
  console.log("[e2e] Running global teardown...");

  cleanupSocketFiles();
  cleanupTempConfigDirs();

  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }

  console.log("[e2e] Global teardown complete.");
}
