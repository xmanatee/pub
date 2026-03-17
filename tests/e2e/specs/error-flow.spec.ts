/**
 * Error flow E2E tests.
 *
 * Verifies that canvas render errors and command execution failures
 * surface as system messages in the browser chat and (for render errors)
 * are forwarded to the agent via the RENDER_ERROR channel.
 */
import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedUser } from "../fixtures/convex";
import { clearRules, setupDefaultRules } from "../fixtures/mock-llm";

let cli: CliFixture;

test.beforeEach(async () => {
  clearAll();
  await setupDefaultRules();
});

test.afterEach(async () => {
  cli?.cleanup();
  await clearRules();
});

/**
 * Test 1: Canvas JS error appears as a system message.
 * Verifies: canvas throws → window.onerror catches → handleRenderError →
 * addSystemMessage → system message visible in browser.
 *
 * Uses a delayed throw so the canvas loads and the UI is ready before the error fires.
 */
test("canvas render error surfaces as system message", async ({ page }) => {
  const user = seedUser("Canvas Error User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  const html = `<!DOCTYPE html>
<html>
<head><title>Canvas Error Test</title></head>
<body>
  <div id="status">loaded</div>
  <script>
    setTimeout(function() {
      // This fires after the UI is ready and triggers window.onerror
      var obj = null;
      obj.nonexistentMethod();
    }, 1000);
  </script>
</body>
</html>`;

  await api.createPub({ slug: "canvas-error-e2e", title: "Canvas Error E2E", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("canvas-error-bot");

  await injectAuth(page, user);
  await page.goto("/p/canvas-error-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  // The canvas fires the error after 1s. The system message should appear
  // as a preview badge in the control bar (shows "System" label + error text).
  await expect(page.getByText(/null/i)).toBeVisible({ timeout: 15_000 });
});

/**
 * Test 2: Command execution failure appears as a system message.
 * Verifies: canvas auto-invokes command → daemon executes → shell fails →
 * error result returned → command.phase=failed → system message created.
 */
test("command failure surfaces as system message", async ({ page }) => {
  const user = seedUser("Command Error User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  const html = `<!DOCTYPE html>
<html>
<head><title>Command Error Test</title></head>
<body>
  <div id="cmd-result">pending</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "error-cmd",
    "functions": [
      {
        "name": "failingTask",
        "description": "Always fails",
        "returns": "text",
        "executor": {
          "kind": "shell",
          "script": "printf 'E2E_CMD_FAIL_REASON' >&2; exit 1"
        }
      }
    ]
  }
  </script>
  <script>
    pub.command('failingTask', {}).then(function(r) {
      document.getElementById('cmd-result').textContent = 'ok: ' + r;
    }).catch(function(e) {
      document.getElementById('cmd-result').textContent = 'error: ' + e.message;
    });
  </script>
</body>
</html>`;

  await api.createPub({ slug: "cmd-error-e2e", title: "Cmd Error E2E", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("cmd-error-bot");

  await injectAuth(page, user);
  await page.goto("/p/cmd-error-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  // The canvas auto-invokes the failing command on load. It gets queued
  // until WebRTC connects, then dispatched. The daemon runs the shell
  // command which exits with code 1.
  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#cmd-result")).toContainText("error:", { timeout: 30_000 });

  // The command failure should also appear as a system message.
  // The system message format is: Command "failingTask" failed: <error>
  await expect(page.getByText(/Command.*failingTask.*failed/)).toBeVisible({ timeout: 15_000 });
});
