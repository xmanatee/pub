/**
 * E2E tests for the `window.pub` canvas API — multi-bridge.
 *
 * Covers agent commands (executor.kind = "agent", mode = "main") with
 * text and JSON return types. Agent commands require `invokeAgentCommand`
 * support, which is limited to LLM-backed bridges.
 */
import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import {
  AGENT_COMMAND_MODES,
  activeModes,
  createBridgeTestConfig,
} from "../fixtures/bridge-configs";
import { clearBridgeRules, setupBridgeDefaultRules } from "../fixtures/bridge-test-helpers";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedUser } from "../fixtures/convex";
import { addRule } from "../fixtures/mock-llm";
import { waitForConnection } from "../helpers/live-test-utils";

const AGENT_COMMAND_HTML = `<!DOCTYPE html>
<html>
<head><title>Agent Command Test</title></head>
<body>
  <button id="run-text" type="button">Run Text</button>
  <div id="text-result">idle</div>
  <button id="run-json" type="button">Run JSON</button>
  <div id="json-result">idle</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "agent-cmd-e2e",
    "functions": [
      {
        "name": "echoAgent",
        "returns": "text",
        "executor": {
          "kind": "agent",
          "prompt": "Reply with exactly the word: {{word}}",
          "mode": "main"
        }
      },
      {
        "name": "analyzeAgent",
        "returns": "json",
        "executor": {
          "kind": "agent",
          "prompt": "Reply with only this JSON: {\\"color\\":\\"{{color}}\\",\\"count\\":{{count}}}",
          "mode": "main",
          "output": "json"
        }
      }
    ]
  }
  </script>
  <script>
    document.getElementById('run-text').addEventListener('click', function() {
      document.getElementById('text-result').textContent = 'running';
      pub.command('echoAgent', { word: 'pineapple' }).then(function(r) {
        document.getElementById('text-result').textContent = 'text:' + r;
      }).catch(function(e) {
        document.getElementById('text-result').textContent = 'error:' + e.message;
      });
    });
    document.getElementById('run-json').addEventListener('click', function() {
      document.getElementById('json-result').textContent = 'running';
      pub.command('analyzeAgent', { color: 'red', count: 3 }).then(function(r) {
        document.getElementById('json-result').textContent = 'json:' + JSON.stringify(r);
      }).catch(function(e) {
        document.getElementById('json-result').textContent = 'error:' + e.message;
      });
    });
  </script>
</body>
</html>`;

for (const mode of activeModes(AGENT_COMMAND_MODES)) {
  test.describe(`[${mode}] agent commands`, () => {
    let cli: CliFixture;

    test.beforeEach(async () => {
      clearAll();
      await setupBridgeDefaultRules(mode);
    });

    test.afterEach(async () => {
      cli?.cleanup();
      await clearBridgeRules(mode);
    });

    test("agent command: text return via main-mode bridge", async ({ page }) => {
      const user = seedUser("Agent Text Cmd User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      await api.createPub({ slug: "agent-text-cmd", content: AGENT_COMMAND_HTML });
      await addRule({ match: "Reply with exactly the word:", text: "pineapple" });

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
      await cli.startDaemon("agent-text-bot");

      await injectAuth(page, user);
      await page.goto("/p/agent-text-cmd");

      await waitForConnection(page);

      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#run-text")).toBeVisible({ timeout: 10_000 });
      await canvasFrame.locator("#run-text").click();

      await expect(canvasFrame.locator("#text-result")).toHaveText("text:pineapple", {
        timeout: 30_000,
      });
    });

    test("agent command: JSON return via main-mode bridge", async ({ page }) => {
      const user = seedUser("Agent JSON Cmd User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      await api.createPub({ slug: "agent-json-cmd", content: AGENT_COMMAND_HTML });
      await addRule({ match: "Reply with only this JSON:", text: '{"color":"red","count":3}' });

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
      await cli.startDaemon("agent-json-bot");

      await injectAuth(page, user);
      await page.goto("/p/agent-json-cmd");

      await waitForConnection(page);

      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#run-json")).toBeVisible({ timeout: 10_000 });
      await canvasFrame.locator("#run-json").click();

      await expect(canvasFrame.locator("#json-result")).toHaveText(
        'json:{"color":"red","count":3}',
        { timeout: 30_000 },
      );
    });
  });
}
