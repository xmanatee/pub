/**
 * Full-stack tunnel live session E2E tests.
 *
 * Tests the complete tunnel flow with the REAL CLI daemon:
 *   pub start → daemon starts dev server → registers tunnel →
 *   connects relay → browser loads content through relay proxy.
 *
 * Uses the claude-channel bridge mode (lightest mock backend).
 */

import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createBridgeTestConfig } from "../fixtures/bridge-configs";
import { clearBridgeRules, setupBridgeDefaultRules } from "../fixtures/bridge-test-helpers";
import { CliFixture, type TunnelTestConfig } from "../fixtures/cli";
import { clearAll, getFirstTunnelToken, getState, seedUser } from "../fixtures/convex";
import { createTestDevServerDir } from "../helpers/test-dev-server";

const RELAY_URL = process.env.TUNNEL_RELAY_URL ?? "http://localhost:4102";
const BRIDGE_MODE = "claude-channel" as const;

function randomPort(): number {
  return 14200 + Math.floor(Math.random() * 800);
}

test.describe
  .serial("Tunnel live session (real daemon)", () => {
    let cli: CliFixture;

    test.beforeEach(async () => {
      clearAll();
      await setupBridgeDefaultRules(BRIDGE_MODE);
    });

    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixtures
    test.afterEach(async ({}, testInfo) => {
      if (testInfo.status !== "passed") {
        const log = cli?.getDaemonLog(80);
        if (log) console.log(`[tunnel-live] daemon log:\n${log}`);
      }
      cli?.cleanup();
      await new Promise((r) => setTimeout(r, 2_000));
      await clearBridgeRules(BRIDGE_MODE);
    });

    function setupTunnelCli(userName: string) {
      const port = randomPort();
      const user = seedUser(userName);
      const { convexProxyUrl } = getState();
      const devServer = createTestDevServerDir(port);
      const tunnelConfig: TunnelTestConfig = {
        devCommand: `node ${join(devServer.dir, "server.js")}`,
        devPort: port,
        relayUrl: RELAY_URL,
      };
      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(BRIDGE_MODE), tunnelConfig);
      return { user, port };
    }

    async function waitForTunnelToken(timeoutMs = 60_000): Promise<string> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const token = getFirstTunnelToken();
        if (token) return token;
        await new Promise((r) => setTimeout(r, 2_000));
      }
      throw new Error("Tunnel token not found within timeout");
    }

    test("daemon starts dev server and registers tunnel", async () => {
      setupTunnelCli("Tunnel Start User");
      await cli.startDaemon("tunnel-start-bot");

      const status = cli.getStatus();
      expect(status).toContain("running");
      expect(status).toContain("connected");

      const token = await waitForTunnelToken();
      expect(token.length).toBeGreaterThan(0);
    });

    test("browser loads dev server content through tunnel relay", async ({ page }) => {
      setupTunnelCli("Tunnel HTTP User");
      await cli.startDaemon("tunnel-http-bot");

      const token = await waitForTunnelToken();

      // Wait for relay WS to connect (token exists in Convex but relay connection is async)
      await expect(async () => {
        const res = await fetch(`${RELAY_URL}/t/${token}/`);
        expect(res.status).toBe(200);
      }).toPass({ timeout: 15_000 });

      await page.goto(`${RELAY_URL}/t/${token}/`);
      await expect(page.locator("#heading")).toHaveText("Tunnel Dev Server", { timeout: 10_000 });
      await expect(page.locator("#status")).toHaveText("ok");
    });

    test("tunnel closes when daemon stops", async () => {
      setupTunnelCli("Tunnel Stop User");
      await cli.startDaemon("tunnel-stop-bot");

      const token = await waitForTunnelToken();

      // Wait for relay WS to connect before verifying 200
      await expect(async () => {
        const res = await fetch(`${RELAY_URL}/t/${token}/`);
        expect(res.status).toBe(200);
      }).toPass({ timeout: 15_000 });

      cli.stop();
      await new Promise((r) => setTimeout(r, 5_000));

      // After daemon stops, the relay returns either 401 (token invalid because
      // host went offline in Convex) or 502 (daemon WS disconnected).
      const res2 = await fetch(`${RELAY_URL}/t/${token}/`);
      expect([401, 502]).toContain(res2.status);
    });
  });
