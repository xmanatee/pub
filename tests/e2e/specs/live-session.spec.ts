/**
 * Full-stack live session E2E tests.
 *
 * Exercises the complete flow: CLI daemon (mock bridge) → Convex → Browser.
 * Each test is self-contained: seeds user, creates pub, starts daemon, connects browser.
 *
 * The mock bridge (`openclaw-like` mode) receives messages as $1 and echoes
 * them back via `pub write`.
 */
import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedUser } from "../fixtures/convex";

let cli: CliFixture;

async function retryWrite(fixture: CliFixture, message: string, maxAttempts = 10): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      fixture.write(message);
      return;
    } catch (e) {
      if (i === maxAttempts - 1 || !String(e).includes("Live session is not established")) throw e;
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
}

test.beforeEach(() => {
  clearAll();
});

test.afterEach(() => {
  cli?.cleanup();
});

/**
 * Test 1: Agent lifecycle via CLI.
 * Verifies: pub start → presence registered → pub status → pub stop → presence gone.
 */
test("agent lifecycle: start, status, stop", async () => {
  const user = seedUser("Lifecycle User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  expect((await api.createPub({ slug: "lifecycle", title: "Lifecycle" })).status).toBe(201);

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("lifecycle-bot");

  const status = cli.getStatus();
  expect(status).toContain("running");
  expect(status).toContain("connected");

  // Second goOnline should fail — key already in use
  const conflictRes = await api.agentOnline({
    daemonSessionId: "conflict-session",
    agentName: "conflict-bot",
  });
  expect(conflictRes.status).toBeGreaterThanOrEqual(400);

  cli.stop();
  await new Promise((r) => setTimeout(r, 3_000));

  // After stop, going online should succeed
  const afterStopRes = await api.agentOnline({
    daemonSessionId: "after-stop",
    agentName: "after-stop-bot",
  });
  expect(afterStopRes.status).toBe(200);
  await api.agentOffline({ daemonSessionId: "after-stop" });
});

/**
 * Test 2: Browser sees online agent and control bar activates.
 * Verifies: daemon presence → browser auth → agent auto-selected → message input visible.
 *
 * With 1 online agent, the UI auto-selects it and shows the message input directly.
 */
test("browser detects agent and shows live control bar", async ({ page }) => {
  const user = seedUser("Connection User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "connect-test", title: "Connect Test" });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("connect-bot");

  await injectAuth(page, user);
  await page.goto("/p/connect-test");

  // With 1 agent online, the control bar auto-selects and shows the message input.
  // The message input (aria-label="Message") confirms: auth worked, presence detected, agent selected.
  // Note: the input starts as a <button> with aria-label="Message", not a <textarea> with placeholder.
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
});

/**
 * Test 3: Chat message roundtrip through the full stack.
 * Verifies: browser sends chat → WebRTC → daemon → mock bridge → pub write → WebRTC → browser.
 */
test("chat roundtrip: browser to mock bridge and back", async ({ page }) => {
  const user = seedUser("Chat User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "chat-e2e", title: "Chat E2E" });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("chat-bot");

  await injectAuth(page, user);
  await page.goto("/p/chat-e2e");

  // Wait for message input (agent auto-selected)
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  // Click the message input to activate it (transitions from button to textarea)
  await page.getByLabel("Message").click();

  // Fill the message
  await page.getByLabel("Message").fill("hello from browser");

  // Wait for the send button to be enabled (WebRTC connection must be established first)
  await expect(page.getByLabel("Send message")).toBeEnabled({ timeout: 60_000 });
  await page.getByLabel("Send message").click();

  // The mock bridge should echo back: "echo: hello from browser"
  await expect(page.getByText("echo: hello from browser")).toBeVisible({ timeout: 30_000 });
});

/**
 * Test 4: CLI `pub write` sends a message that appears in the browser.
 * Verifies: CLI write → daemon → WebRTC → browser displays message.
 */
test("cli write delivers message to browser", async ({ page }) => {
  const user = seedUser("Write User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "write-e2e", title: "Write E2E" });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("write-bot");

  await injectAuth(page, user);
  await page.goto("/p/write-e2e");

  // Wait for message input (agent auto-selected)
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  // Wait for WebRTC connection by checking send button is enabled
  await page.getByLabel("Message").click();
  await page.getByLabel("Message").fill("_");
  await expect(page.getByLabel("Send message")).toBeEnabled({ timeout: 60_000 });
  await page.keyboard.press("Escape");

  // Send a message from the CLI (retry if live session not yet established on daemon side)
  await retryWrite(cli, "hello from CLI");

  // Verify it appears in the browser chat
  await expect(page.getByText("hello from CLI")).toBeVisible({ timeout: 15_000 });
});

/**
 * Test 5: Canvas content with command manifest loads and command executes.
 * Verifies: HTML with command manifest → canvas renders → command triggers → result returns.
 */
test("canvas command executes via daemon", async ({ page }) => {
  const user = seedUser("Command User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  const html = `<!DOCTYPE html>
<html>
<head><title>Command Test</title></head>
<body>
  <h1>Command Test App</h1>
  <button id="run-cmd" onclick="runCommand()">Run Command</button>
  <div id="result">waiting</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "test-commands",
    "functions": [
      {
        "name": "greet",
        "description": "Returns a greeting",
        "returns": "text",
        "executor": {
          "kind": "shell",
          "script": "echo 'hello from command'"
        }
      }
    ]
  }
  </script>
  <script>
    async function runCommand() {
      try {
        const result = await window.pub.command('greet', {});
        document.getElementById('result').textContent = 'result: ' + result;
      } catch (e) {
        document.getElementById('result').textContent = 'error: ' + e.message;
      }
    }
  </script>
</body>
</html>`;

  await api.createPub({ slug: "cmd-e2e", title: "Command E2E", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("cmd-bot");

  await injectAuth(page, user);
  await page.goto("/p/cmd-e2e");

  // Wait for message input (agent auto-selected)
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  // Wait for WebRTC connection before invoking canvas commands
  await page.getByLabel("Message").click();
  await page.getByLabel("Message").fill("_");
  await expect(page.getByLabel("Send message")).toBeEnabled({ timeout: 60_000 });
  await page.keyboard.press("Escape");

  // The canvas content should be rendered in an iframe
  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#run-cmd")).toBeVisible({ timeout: 10_000 });
  await canvasFrame.locator("#run-cmd").click();

  // Wait for the command result
  await expect(canvasFrame.locator("#result")).toContainText("hello from command", {
    timeout: 15_000,
  });
});
