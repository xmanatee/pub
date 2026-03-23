/**
 * E2E tests for commands fired at canvas load time.
 *
 * Verifies the full path: canvas JS auto-invokes command on load →
 * useCanvasCommands queues it (liveReady=false) → WebRTC connects →
 * queued command dispatched → daemon executes shell → result returns →
 * canvas renders the result in the DOM.
 *
 * Uses real OpenClaw with a mock LLM server.
 */
import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedUser } from "../fixtures/convex";
import { addRule, clearRules, setupDefaultRules } from "../fixtures/mock-llm";

let cli: CliFixture;

/** Canvas HTML that fires a real shell command (pwd) immediately on load and renders the result. */
const AUTO_INVOKE_HTML = `<!DOCTYPE html>
<html>
<head><title>Early Command</title></head>
<body>
  <div id="result">pending</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "early-cmd",
    "functions": [
      {
        "name": "cwd",
        "description": "Returns the current working directory",
        "returns": "text",
        "executor": {
          "kind": "shell",
          "script": "pwd"
        }
      }
    ]
  }
  </script>
  <script>
    window.pub.command('cwd', {}).then(function(result) {
      document.getElementById('result').textContent = 'cwd: ' + result;
    }).catch(function(e) {
      document.getElementById('result').textContent = 'error: ' + e.message;
    });
  </script>
</body>
</html>`;

test.beforeEach(async () => {
  clearAll();
  await setupDefaultRules();
});

test.afterEach(async () => {
  cli?.cleanup();
  await clearRules();
});

/**
 * Test 1: Command fired at canvas load resolves after WebRTC connects.
 * The inline script calls pub.command() before liveReady is true.
 * The command is queued, then dispatched once the connection is established.
 */
test("command fired at canvas load resolves after connection", async ({ page }) => {
  const user = seedUser("Early Cmd User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "early-cmd", content: AUTO_INVOKE_HTML });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("early-cmd-bot");

  await injectAuth(page, user);
  await page.goto("/p/early-cmd");

  // Wait for agent auto-selection
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  // The canvas auto-fired `pwd` on load. Once WebRTC connects and the
  // queued command is dispatched, the real shell output should appear in the iframe.
  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#result")).toHaveText(/^cwd: \//, {
    timeout: 30_000,
  });
});

/**
 * Test 2: Command fired at canvas load resolves even with a 10-second briefing delay.
 * Same auto-invoking HTML, but the mock LLM responds slowly to the session briefing.
 * The command should still resolve — it must not timeout or be dropped.
 */
test("command fired at canvas load resolves with slow briefing (10s)", async ({ page }) => {
  const user = seedUser("Slow Brief User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "slow-brief", content: AUTO_INVOKE_HTML });

  // Replace default rules with a slow-responding briefing rule.
  // Must clear first — rules are first-match-wins, so adding a second
  // "Session started" rule after the default one would never trigger.
  await clearRules();
  await addRule({
    match: "Session started",
    text: "Session acknowledged after delay.",
    delayMs: 10_000,
  });
  await addRule({
    match: 'pub write "pong"',
    text: "Connectivity probe acknowledged.",
  });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("slow-brief-bot");

  await injectAuth(page, user);
  await page.goto("/p/slow-brief");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#result")).toHaveText(/^cwd: \//, {
    timeout: 60_000,
  });
});
