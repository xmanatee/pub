/**
 * Global setup for full-stack E2E tests.
 *
 * Expects env vars from the calling script (e2e-local.sh or Docker):
 *   CONVEX_URL, CONVEX_SITE_URL, ADMIN_KEY
 *
 * Steps:
 *  1. Wait for Convex backend
 *  2. Set auth env vars (dummy OAuth creds + SITE_URL)
 *  3. Deploy Convex functions
 *  4. Build CLI binary
 *  5. Seed default test user
 *  6. Write state file for test fixtures
 */
import { execSync, spawnSync } from "node:child_process";
import { buildCli } from "./fixtures/cli";
import { type E2EState, seedUser, writeState } from "./fixtures/convex";
import { generateAuthKeys } from "./helpers/generate-auth-keys";
import { waitForUrl } from "./helpers/wait-for";

export default async function globalSetup() {
  const convexUrl = process.env.CONVEX_URL ?? "http://localhost:3210";
  const convexSiteUrl = process.env.CONVEX_SITE_URL ?? "http://localhost:3211";
  const convexProxyUrl = process.env.CONVEX_PROXY_URL ?? convexSiteUrl;
  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey) {
    throw new Error("ADMIN_KEY env var is required. Run via scripts/e2e-local.sh.");
  }

  console.log("[e2e] Waiting for Convex backend...");
  await waitForUrl(`${convexUrl}/version`, { timeout: 60_000, interval: 2_000 });
  console.log("[e2e] Convex backend ready.");

  // Write initial state so runMutation/convex commands work
  const state: E2EState = { adminKey, convexUrl, convexSiteUrl, convexProxyUrl, users: [] };
  writeState(state);

  // Set auth env vars (dummy values for local OAuth providers)
  console.log("[e2e] Setting auth env vars...");
  const envVars: Record<string, string> = {
    SITE_URL: convexSiteUrl,
    AUTH_GITHUB_ID: "test-github-id",
    AUTH_GITHUB_SECRET: "test-github-secret",
    AUTH_GOOGLE_ID: "test-google-id",
    AUTH_GOOGLE_SECRET: "test-google-secret",
    IS_TEST: "true",
  };
  for (const [key, value] of Object.entries(envVars)) {
    try {
      execSync(
        `npx convex env set ${key} "${value}" --admin-key "${adminKey}" --url "${convexUrl}"`,
        { encoding: "utf-8", timeout: 15_000, stdio: "pipe" },
      );
    } catch {
      // May already be set
    }
  }

  // Generate and set JWT keys for @convex-dev/auth
  console.log("[e2e] Generating auth keys...");
  const authKeys = generateAuthKeys();
  for (const [key, value] of Object.entries(authKeys)) {
    // Use stdin to avoid Commander.js parsing PEM keys as flags
    const result = spawnSync(
      "npx",
      ["convex", "env", "set", key, "--admin-key", adminKey, "--url", convexUrl],
      { input: value, encoding: "utf-8", timeout: 15_000, stdio: ["pipe", "pipe", "pipe"] },
    );
    if (result.status !== 0) {
      console.warn(`[e2e] Warning: failed to set ${key}: ${result.stderr}`);
    }
  }

  // Deploy Convex functions
  console.log("[e2e] Deploying Convex functions...");
  execSync(`npx convex deploy --admin-key "${adminKey}" --url "${convexUrl}" -y`, {
    encoding: "utf-8",
    stdio: "inherit",
    timeout: 120_000,
    env: { ...process.env, IS_TEST: "true" },
  });

  // Build CLI binary
  console.log("[e2e] Building CLI...");
  buildCli();

  // Seed default test user
  console.log("[e2e] Seeding test user...");
  const defaultUser = seedUser("E2E Default User");
  state.users.push(defaultUser);
  writeState(state);

  console.log("[e2e] Global setup complete.");
}
