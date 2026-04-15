/**
 * Full-stack super-app journey: real daemon + real TanStack Start dev server +
 * real browser. Only the LLM is mocked (openclaw bridge talks to mock LLM).
 *
 * Verifies every layer between browser and host for the `files` use case
 * (server-fn filesystem read + daemon-routed exec spec):
 *   browser click → TanStack server fn → daemon IPC → `mkdir` → listing update.
 *
 * Regresses: server-fn POST, daemon IPC `run-command-spec`, CommandFunctionSpec
 * exec executor, and the super-app's useAsync/withErrorAlert client wiring.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createBridgeTestConfig } from "../fixtures/bridge-configs";
import { clearBridgeRules, setupBridgeDefaultRules } from "../fixtures/bridge-test-helpers";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedUser } from "../fixtures/convex";
import { SuperAppDevServer } from "../helpers/super-app-dev-server";

const BRIDGE_MODE = "openclaw" as const;

test.describe
  .serial("super-app full-stack journey", () => {
    let cli: CliFixture;
    let devServer: SuperAppDevServer;

    test.beforeEach(async () => {
      clearAll();
      await setupBridgeDefaultRules(BRIDGE_MODE);
    });

    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixtures
    test.afterEach(async ({}, testInfo) => {
      if (testInfo.status !== "passed") {
        const log = cli?.getDaemonLog(80);
        if (log) console.log(`[super-app-fullstack] daemon log:\n${log}`);
      }
      await devServer?.cleanup();
      cli?.cleanup();
      await clearBridgeRules(BRIDGE_MODE);
    });

    test("browser → server fn → daemon → exec spec round-trip (files)", async ({ page }) => {
      // 1. Start daemon. openclaw bridge gives us a real daemon + mock LLM path
      // for any chat traffic — we only need the exec executor for this spec.
      const user = seedUser("Super-App E2E User");
      const { convexProxyUrl } = getState();
      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(BRIDGE_MODE));
      await cli.startDaemon("super-app-bot");

      // 2. Start super-app dev server pointed at the daemon's isolated socket.
      devServer = new SuperAppDevServer({ agentSocketPath: cli.agentSocketPath });
      const url = await devServer.start();

      // 3. Seed files under the isolated HOME so the Files page has real content.
      mkdirSync(join(devServer.home, "alpha"), { recursive: true });
      writeFileSync(join(devServer.home, "hello.txt"), "hello world\n");

      // Server-fn read: directory listing shows the seeded entries.
      await page.goto(`${url}/files`);
      await expect(page.getByText("alpha").first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("hello.txt").first()).toBeVisible();

      // Daemon-routed exec: click New folder, the `mkdir` spec runs through
      // the daemon, and the next list reflects the new directory.
      page.once("dialog", (d) => d.accept("beta"));
      await page.getByRole("button", { name: "New folder" }).click();
      await expect(page.getByText("beta").first()).toBeVisible({ timeout: 15_000 });
    });
  });
