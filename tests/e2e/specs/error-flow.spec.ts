/**
 * Error flow E2E tests.
 *
 * Verifies that canvas render errors and command execution failures
 * surface correctly in the browser and are forwarded to the agent.
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
 * Test 1: Canvas JS error is caught by the bridge error handler.
 * Verifies: canvas throws → window error event → bridge postMessage → parent.
 *
 * The error is triggered only after the owner UI is ready, so the test does
 * not depend on auth/query timing. The bridge's window error handler catches
 * it, posts it to the parent, and the parent creates a system message.
 */
test("canvas render error surfaces as system message", async ({ page }) => {
  const user = seedUser("Canvas Error User");
  const { convexProxyUrl } = getState();
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

  await api.createPub({ slug: "canvas-error-e2e", title: "Canvas Error E2E", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("canvas-error-bot");

  await injectAuth(page, user);
  await page.goto("/p/canvas-error-e2e");

  // Wait for the owner UI before triggering the render error. This guarantees
  // onRenderError is wired and avoids Docker auth timing races.
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const canvasFrame = page.frameLocator("iframe").first();
  await canvasFrame.locator("#throw").click();

  // The render error becomes a system preview notification in the control bar.
  await expect(page.getByText(sentinel)).toBeVisible({ timeout: 15_000 });
});

/**
 * Test 2: Command execution failure surfaces in the canvas.
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

  await api.createPub({ slug: "cmd-error-e2e", title: "Cmd Error E2E", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("cmd-error-bot");

  await injectAuth(page, user);
  await page.goto("/p/cmd-error-e2e");

  // The canvas auto-invokes the failing command. Verify the error result
  // appears in the iframe — confirms the full error pipeline works.
  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#cmd-result")).toContainText("error:", { timeout: 30_000 });
});
