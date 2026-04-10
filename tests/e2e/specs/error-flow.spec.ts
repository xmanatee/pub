/**
 * Error flow E2E tests.
 *
 * Verifies that canvas render errors and command execution failures
 * surface correctly in the browser.
 */
import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { ALL_BRIDGE_MODES, activeModes, createBridgeTestConfig } from "../fixtures/bridge-configs";
import { clearBridgeRules, setupBridgeDefaultRules } from "../fixtures/bridge-test-helpers";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedUser } from "../fixtures/convex";

// ---------------------------------------------------------------------------
// Test 1: Canvas render error — no CLI/bridge needed (static pub)
// ---------------------------------------------------------------------------

test.describe("canvas render error", () => {
  test.beforeEach(async () => {
    clearAll();
  });

  /**
   * Canvas JS error is caught by the bridge error handler.
   * Verifies: canvas throws → window error event → bridge postMessage → parent.
   *
   * The error is triggered after the static owner canvas is ready. This keeps
   * the test on the local render-error path instead of depending on live
   * session startup.
   */
  test("canvas render error surfaces as system message", async ({ page }) => {
    const user = seedUser("Canvas Error User");
    const api = new ApiClient({ user });
    const sentinel = "E2E_CANVAS_RENDER_ERROR";

    const html = `<!DOCTYPE html>
<html>
<head><title>Canvas Error Test</title></head>
<body>
  <div id="status">loaded</div>
  <button id="throw" onclick="triggerRenderError()">Throw</button>
  <script>
    function triggerRenderError() {
      setTimeout(function() {
        throw new Error('${sentinel}');
      }, 0);
    }
  </script>
</body>
</html>`;

    await api.createPub({ slug: "canvas-error-e2e", content: html });

    await injectAuth(page, user);
    await page.goto("/p/canvas-error-e2e");

    const canvasFrame = page.frameLocator("iframe").first();
    await expect(canvasFrame.locator("#throw")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () =>
        canvasFrame
          .locator("body")
          .evaluate(() => typeof (window as Window & { pub?: unknown }).pub === "object"),
      )
      .toBe(true);
    await canvasFrame.locator("#throw").click();

    await expect(page.getByLabel("Open chat")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Open chat").click();

    // Render errors are stored as durable system messages; the canvas preview
    // is only a notification layer on top of this state.
    await expect(page.getByText(`Error: ${sentinel}`, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});

// ---------------------------------------------------------------------------
// Test 2: Command failure — single bridge mode (error propagation is
// bridge-agnostic; bridge-specific command execution is covered elsewhere)
// ---------------------------------------------------------------------------

for (const mode of activeModes(ALL_BRIDGE_MODES).slice(0, 1)) {
  test.describe(`[${mode}] command failure`, () => {
    let cli: CliFixture;

    test.beforeEach(async () => {
      clearAll();
      await setupBridgeDefaultRules(mode);
    });

    test.afterEach(async () => {
      cli?.cleanup();
      await clearBridgeRules(mode);
    });

    /**
     * Command execution failure surfaces in the canvas.
     * Verifies: canvas auto-invokes command → daemon executes → shell fails →
     * error result returned to canvas via WebRTC.
     */
    test("command failure surfaces in canvas", async ({ page }) => {
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

      await api.createPub({ slug: "cmd-error-e2e", content: html });

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
      await cli.startDaemon("cmd-error-bot");

      await injectAuth(page, user);
      await page.goto("/p/cmd-error-e2e");

      // The canvas auto-invokes the failing command. Verify the error result
      // appears in the iframe — confirms the full error pipeline works.
      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#cmd-result")).toContainText("error:", { timeout: 30_000 });
    });
  });
}
