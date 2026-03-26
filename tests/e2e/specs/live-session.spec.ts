/**
 * Full-stack live session E2E tests.
 *
 * Exercises the complete flow: CLI daemon → real OpenClaw → mock LLM → Convex → Browser.
 * Each test is self-contained: seeds user, creates pub, configures mock LLM rules,
 * starts daemon, connects browser.
 *
 * The mock LLM server implements the Anthropic Messages API and responds with
 * tool_use blocks that make OpenClaw execute `pub write` commands.
 */
import { expect, type Page, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedExtraApiKey, seedUser } from "../fixtures/convex";
import { addCanvasRule, addEchoRule, clearRules, setupDefaultRules } from "../fixtures/mock-llm";
import { setTransportPolicy } from "../helpers/transport-policy";

let cli: CliFixture;
const extraClis: CliFixture[] = [];

async function retryWrite(fixture: CliFixture, message: string, maxAttempts = 10): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      fixture.write(message);
      return;
    } catch (e) {
      if (i === maxAttempts - 1 || !String(e).includes("not ready yet")) throw e;
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
}

/**
 * Ensure the page is in live mode, then wait for the WebRTC connection by
 * filling a dummy message and checking the send button becomes enabled.
 *
 * Static owner pubs without a command manifest intentionally start in
 * optional-live mode, so the control bar first shows "Connect agent" instead
 * of the message box. Uses .fill() instead of .click() because the control
 * bar's fixed positioning with pointer-events-none outer container and the
 * full-viewport canvas iframe cause Playwright's hit-test (elementFromPoint)
 * to find the iframe instead of the textarea. The .fill() method auto-focuses
 * without a hit-test check.
 */
async function waitForConnection(page: Page) {
  const textbox = page.getByRole("textbox", { name: "Message" });
  const connectButton = page.getByRole("button", { name: "Connect agent" });

  await expect(textbox.or(connectButton)).toBeVisible({ timeout: 30_000 });
  if (await connectButton.isVisible()) {
    await expect(connectButton).toBeEnabled();
    await connectButton.dispatchEvent("click");
  }

  await expect(textbox).toBeVisible({ timeout: 60_000 });
  await textbox.fill("_");
  await expect(page.getByLabel("Send message")).toBeEnabled({ timeout: 60_000 });
  // Clear the dummy text. Use fill("") instead of Escape — Escape toggles
  // the control bar collapse which hides messages from the notification addon.
  await textbox.fill("");
}

/**
 * Send a chat message via the control bar. Uses .fill() to bypass canvas
 * iframe hit-test interception (see waitForConnection comment).
 */
async function sendChat(page: Page, text: string) {
  const textbox = page.getByRole("textbox", { name: "Message" });
  const sendButton = page.getByLabel("Send message");
  await textbox.fill(text);
  await expect(sendButton).toBeEnabled({ timeout: 60_000 });
  await sendButton.dispatchEvent("click");
}

test.beforeEach(async () => {
  clearAll();
  await setupDefaultRules();
});

test.afterEach(async () => {
  cli?.cleanup();
  for (const c of extraClis) c.cleanup();
  extraClis.length = 0;
  await clearRules();
});

/**
 * Test 1: Agent lifecycle via CLI.
 * Verifies: pub start → presence registered → pub status → pub stop → presence gone.
 */
test("agent lifecycle: start, status, stop", async () => {
  const user = seedUser("Lifecycle User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  expect((await api.createPub({ slug: "lifecycle" })).status).toBe(201);

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

  await api.createPub({ slug: "connect-test" });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("connect-bot");

  await injectAuth(page, user);
  await page.goto("/p/connect-test");

  // With 1 agent online, the control bar auto-selects and shows the message input.
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
});

/**
 * Test 3: Chat message roundtrip through the full stack.
 * Verifies: browser sends chat → WebRTC → daemon → OpenClaw → mock LLM → exec tool →
 *           pub write → WebRTC → browser.
 */
test("chat roundtrip: browser to OpenClaw and back", async ({ page }) => {
  const user = seedUser("Chat User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "chat-e2e" });

  // Configure mock LLM: when user message contains "hello from browser",
  // respond with exec tool calling pub write
  await addEchoRule("hello from browser", "echo: hello from browser");

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("chat-bot");

  await injectAuth(page, user);
  await page.goto("/p/chat-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  await waitForConnection(page);
  await sendChat(page, "hello from browser");

  // OpenClaw calls mock LLM → mock LLM returns exec tool_use → OpenClaw executes
  // pub write "echo: hello from browser" → daemon → WebRTC → browser
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

  await api.createPub({ slug: "write-e2e" });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("write-bot");

  await injectAuth(page, user);
  await page.goto("/p/write-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  await retryWrite(cli, "hello from CLI");

  await expect(page.getByText("hello from CLI")).toBeVisible({ timeout: 15_000 });
});

/**
 * Test 5: Chat + canvas update in a single session.
 * Verifies the full agent interaction loop:
 *   1. Send "hi" → OpenClaw/mock LLM echoes "echo: hi" in chat
 *   2. Send "update canvas" → OpenClaw writes new HTML via `pub write -c canvas`
 *   3. OpenClaw also replies "canvas updated" in chat to confirm
 */
test("chat and canvas update in one session", async ({ page }) => {
  const user = seedUser("Combo User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  const initialHtml = `<!DOCTYPE html>
<html><body><h1 id="status">initial</h1></body></html>`;

  await api.createPub({ slug: "combo-e2e", content: initialHtml });

  // Canvas rule must be added BEFORE the echo rule — rules are first-match-wins,
  // and generic matches like "say hello" could match text in OpenClaw's prompt context.
  await addCanvasRule(
    "update canvas",
    '<html><body><h1 id="status">canvas-updated</h1></body></html>',
    "canvas updated",
  );
  await addEchoRule("say hello", "echo: say hello");

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("combo-bot");

  await injectAuth(page, user);
  await page.goto("/p/combo-e2e");

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#status")).toHaveText("initial", { timeout: 10_000 });

  await waitForConnection(page);

  await sendChat(page, "say hello");
  // Chat reply arrives as a notification badge that auto-dismisses after 6s.
  // With bar collapsed, it may not be visible. Use retryWrite as a fallback
  // to verify the daemon received and relayed the message.
  await retryWrite(cli, "echo: say hello");

  // WebRTC connectivity can come up slightly before the agent finishes its first
  // session turn. Retry the browser-originated canvas update until the iframe
  // content actually changes, which is the definitive end-to-end signal.
  await expect(async () => {
    await sendChat(page, "update canvas");
    await expect(canvasFrame.locator("#status")).toHaveText("canvas-updated", {
      timeout: 8_000,
    });
  }).toPass({ timeout: 30_000 });
});

/**
 * Test 6: Canvas content with command manifest loads and command executes.
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

  await api.createPub({ slug: "cmd-e2e", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("cmd-bot");

  await injectAuth(page, user);
  await page.goto("/p/cmd-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#run-cmd")).toBeVisible({ timeout: 10_000 });
  // The command button can render before the daemon-side command bindings are
  // fully ready. Retry the first invocation until the result resolves.
  await expect(async () => {
    await canvasFrame.locator("#result").evaluate((el) => {
      el.textContent = "waiting";
    });
    await canvasFrame.locator("#run-cmd").click();
    await expect(canvasFrame.locator("#result")).toContainText("hello from command", {
      timeout: 8_000,
    });
  }).toPass({ timeout: 30_000 });
});

/**
 * Test 7: Canvas stages a managed daemon file, uses its path in a command, then downloads
 * a derived managed file back to the browser.
 */
test("canvas writes and reads files via pub-fs, processes via command", async ({ page }) => {
  const user = seedUser("Canvas File User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS File Transfer Test</title></head>
<body>
  <button id="run" type="button">Run</button>
  <div id="result">idle</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "pub-fs-transfer-test",
    "functions": [
      {
        "name": "uppercaseFile",
        "description": "Creates an uppercase sibling file and returns its path",
        "returns": "text",
        "executor": {
          "kind": "shell",
          "script": "INPUT=\\"{{path}}\\"\\nOUTPUT=\\"$(dirname \\"$INPUT\\")/upper-$(basename \\"$INPUT\\")\\"\\ntr '[:lower:]' '[:upper:]' < \\"$INPUT\\" > \\"$OUTPUT\\"\\nprintf '%s' \\"$OUTPUT\\""
        }
      }
    ]
  }
  </script>
  <script>
    document.getElementById('run').addEventListener('click', async () => {
      var result = document.getElementById('result');
      result.textContent = 'running';
      try {
        var writePath = '/__pub_files__/tmp/pub-fs-e2e-input.txt';
        var putRes = await fetch(writePath, { method: 'PUT', body: 'hello pub fs' });
        if (!putRes.ok) throw new Error('PUT failed: ' + putRes.status);

        var readBack = await fetch(writePath).then(function(r) { return r.text(); });
        if (readBack !== 'hello pub fs') throw new Error('read-back mismatch: ' + readBack);

        var processedPath = await pub.command('uppercaseFile', { path: '/tmp/pub-fs-e2e-input.txt' });
        var processed = await fetch('/__pub_files__' + processedPath).then(function(r) { return r.text(); });

        result.textContent = 'ok:' + processed.trim();
      } catch (e) {
        result.textContent = 'error:' + e.message;
      }
    });
  </script>
</body>
</html>`;

  await api.createPub({ slug: "pub-fs-transfer-e2e", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("pub-fs-transfer-bot");

  await injectAuth(page, user);
  await page.goto("/p/pub-fs-transfer-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#run")).toBeVisible({ timeout: 10_000 });
  await canvasFrame.locator("#run").click();

  await expect(canvasFrame.locator("#result")).toHaveText("ok:HELLO PUB FS", { timeout: 30_000 });
});

/**
 * Test 8: Commands survive canvas HTML updates via full-stack agent flow.
 * Verifies: initial canvas with commands loads → commands work → user sends
 * "update canvas" → OpenClaw writes new canvas HTML via `pub write -c canvas` →
 * auto-invoke and button-triggered commands still work with the new manifest.
 *
 * This catches regressions where:
 * - canvasBridgeReady is lost after iframe reload
 * - pending command queue is wiped during session/scope transitions
 * - daemon executor stays idle after rebinding commands
 * - runtime state publish fails due to stale data channels
 */
test("commands work after canvas HTML update", async ({ page }) => {
  const user = seedUser("Canvas Rebind User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  const initialHtml = `<!DOCTYPE html>
<html>
<head><title>Canvas Commands V1</title></head>
<body>
  <div id="auto-result">pending</div>
  <button id="run-cmd" onclick="runCommand()">Run</button>
  <div id="btn-result">waiting</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "v1",
    "functions": [
      {
        "name": "getVersion",
        "returns": "text",
        "executor": { "kind": "shell", "script": "echo 'v1'" }
      }
    ]
  }
  </script>
  <script>
    pub.commands.getVersion().then(function(r) {
      document.getElementById('auto-result').textContent = 'auto: ' + r;
    }).catch(function(e) {
      document.getElementById('auto-result').textContent = 'error: ' + e.message;
    });
    function runCommand() {
      pub.commands.getVersion().then(function(r) {
        document.getElementById('btn-result').textContent = 'btn: ' + r;
      }).catch(function(e) {
        document.getElementById('btn-result').textContent = 'error: ' + e.message;
      });
    }
  </script>
</body>
</html>`;

  await api.createPub({
    slug: "cmd-rebind",
    content: initialHtml,
  });

  // Configure mock LLM: when user sends "update canvas", write new HTML + confirm
  const v2Html = `<!DOCTYPE html>
<html>
<head><title>Canvas Commands V2</title></head>
<body>
  <div id="auto-result">pending</div>
  <button id="run-cmd" onclick="runCommand()">Run</button>
  <div id="btn-result">waiting</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "v2",
    "functions": [
      {
        "name": "getVersion",
        "returns": "text",
        "executor": { "kind": "shell", "script": "echo 'v2'" }
      }
    ]
  }
  </script>
  <script>
    pub.commands.getVersion().then(function(r) {
      document.getElementById('auto-result').textContent = 'auto: ' + r;
    }).catch(function(e) {
      document.getElementById('auto-result').textContent = 'error: ' + e.message;
    });
    function runCommand() {
      pub.commands.getVersion().then(function(r) {
        document.getElementById('btn-result').textContent = 'btn: ' + r;
      }).catch(function(e) {
        document.getElementById('btn-result').textContent = 'error: ' + e.message;
      });
    }
  </script>
</body>
</html>`;
  await addCanvasRule("update canvas", v2Html, "canvas updated");

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("rebind-bot");

  await injectAuth(page, user);
  await page.goto("/p/cmd-rebind");

  const canvasFrame = page.frameLocator("iframe").first();

  // Phase 1: Initial canvas — auto-invoke command works (bar may start collapsed)
  await expect(canvasFrame.locator("#auto-result")).toHaveText("auto: v1", { timeout: 30_000 });

  // Phase 1: Button-triggered command works
  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText("btn: v1", { timeout: 15_000 });

  // Send chat (fill bypasses collapsed bar visibility)
  await sendChat(page, "update canvas");

  // Verify canvas update via iframe — definitive proof the full pipeline works
  await expect(canvasFrame.locator("#auto-result")).toHaveText("auto: v2", { timeout: 30_000 });

  // Phase 2: Button-triggered command in NEW canvas works
  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText("btn: v2", { timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// Canvas HTML with auto-invoke command used by session lifecycle tests below.
// ---------------------------------------------------------------------------
const AUTO_INVOKE_HTML = `<!DOCTYPE html>
<html>
<head><title>Auto Command</title></head>
<body>
  <div id="auto-result">pending</div>
  <button id="run-cmd" onclick="runCommand()">Run</button>
  <div id="btn-result">waiting</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "auto-cmd",
    "functions": [
      {
        "name": "cwd",
        "description": "Returns the current working directory",
        "returns": "text",
        "executor": { "kind": "shell", "script": "pwd" }
      }
    ]
  }
  </script>
  <script>
    pub.command('cwd', {}).then(function(r) {
      document.getElementById('auto-result').textContent = 'cwd: ' + r;
    }).catch(function(e) {
      document.getElementById('auto-result').textContent = 'error: ' + e.message;
    });
    function runCommand() {
      pub.command('cwd', {}).then(function(r) {
        document.getElementById('btn-result').textContent = 'btn: ' + r;
      }).catch(function(e) {
        document.getElementById('btn-result').textContent = 'error: ' + e.message;
      });
    }
  </script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Canvas HTML with TWO auto-invoke commands fired simultaneously on load.
// Tests that the pending queue drains ALL commands, not just the first one.
// ---------------------------------------------------------------------------
const MULTI_AUTO_INVOKE_HTML = `<!DOCTYPE html>
<html>
<head><title>Multi Auto Command</title></head>
<body>
  <div id="result-a">pending-a</div>
  <div id="result-b">pending-b</div>
  <button id="run-cmd" onclick="runCommand()">Run</button>
  <div id="btn-result">waiting</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "multi-cmd",
    "functions": [
      {
        "name": "cwd",
        "returns": "text",
        "executor": { "kind": "shell", "script": "pwd" }
      },
      {
        "name": "whoami",
        "returns": "text",
        "executor": { "kind": "shell", "script": "whoami" }
      }
    ]
  }
  </script>
  <script>
    pub.command('cwd', {}).then(function(r) {
      document.getElementById('result-a').textContent = 'cwd: ' + r;
    }).catch(function(e) {
      document.getElementById('result-a').textContent = 'error-a: ' + e.message;
    });
    pub.command('whoami', {}).then(function(r) {
      document.getElementById('result-b').textContent = 'user: ' + r;
    }).catch(function(e) {
      document.getElementById('result-b').textContent = 'error-b: ' + e.message;
    });
    function runCommand() {
      pub.command('cwd', {}).then(function(r) {
        document.getElementById('btn-result').textContent = 'btn: ' + r;
      }).catch(function(e) {
        document.getElementById('btn-result').textContent = 'error: ' + e.message;
      });
    }
  </script>
</body>
</html>`;

/**
 * Test 9: Page reload — commands work after a full page reload.
 */
test("page reload: commands work after reload", async ({ page }) => {
  const user = seedUser("Reload User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });
  const counterFile = `/tmp/pub-reload-counter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const reloadHtml = `<!DOCTYPE html>
<html>
<head><title>Reload Command</title></head>
<body>
  <div id="auto-result">pending</div>
  <button id="run-cmd" onclick="runCommand()">Run</button>
  <div id="btn-result">waiting</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "reload-cmd",
    "functions": [
      {
        "name": "nextLoadCount",
        "returns": "text",
        "executor": {
          "kind": "shell",
          "script": "COUNT_FILE=\\"${counterFile}\\"\\ncount=$(cat \\"$COUNT_FILE\\" 2>/dev/null || echo 0)\\ncount=$((count + 1))\\nprintf '%s' \\"$count\\" > \\"$COUNT_FILE\\"\\nprintf '%s' \\"$count\\""
        }
      },
      {
        "name": "cwd",
        "returns": "text",
        "executor": { "kind": "shell", "script": "pwd" }
      }
    ]
  }
  </script>
  <script>
    pub.command('nextLoadCount', {}).then(function(r) {
      document.getElementById('auto-result').textContent = 'load: ' + r;
    }).catch(function(e) {
      document.getElementById('auto-result').textContent = 'error: ' + e.message;
    });
    function runCommand() {
      pub.command('cwd', {}).then(function(r) {
        document.getElementById('btn-result').textContent = 'btn: ' + r;
      }).catch(function(e) {
        document.getElementById('btn-result').textContent = 'error: ' + e.message;
      });
    }
  </script>
</body>
</html>`;

  await api.createPub({ slug: "reload-e2e", content: reloadHtml });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("reload-bot");

  await injectAuth(page, user);
  await page.goto("/p/reload-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#auto-result")).toHaveText("load: 1", { timeout: 30_000 });

  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 15_000 });

  await page.reload();

  const switchBtn = page.getByLabel("Switch here");
  const messageInput = page.getByLabel("Message");
  await expect(switchBtn.or(messageInput)).toBeVisible({ timeout: 30_000 });
  if (await switchBtn.isVisible()) {
    await switchBtn.dispatchEvent("click");
  }
  await expect(messageInput).toBeVisible({ timeout: 30_000 });
  await expect(canvasFrame.locator("#auto-result")).toHaveText("load: 2", { timeout: 30_000 });

  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 30_000 });
});

/**
 * Test 10: Takeover — second browser session takes over an active live session.
 */
test("takeover: second browser takes over and commands work", async ({ page, browser }) => {
  const user = seedUser("Takeover User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "takeover-e2e", content: AUTO_INVOKE_HTML });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("takeover-bot");

  await injectAuth(page, user);
  await page.goto("/p/takeover-e2e");
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const frame1 = page.frameLocator("iframe").first();
  await expect(frame1.locator("#auto-result")).toHaveText(/^cwd: \//, { timeout: 30_000 });

  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await injectAuth(page2, user);
  await page2.goto("/p/takeover-e2e");

  await expect(page2.getByLabel("Switch here")).toBeVisible({ timeout: 30_000 });
  await page2.getByLabel("Switch here").dispatchEvent("click");

  await expect(page2.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  const frame2 = page2.frameLocator("iframe").first();
  await frame2.locator("#run-cmd").click();
  await expect(frame2.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 30_000 });

  await context2.close();
});

/**
 * Test 11: Navigate between pubs — auto-invoke commands work on the second pub.
 */
test("navigate between pubs: commands work on both", async ({ page }) => {
  const user = seedUser("Navigate User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "nav-a", content: AUTO_INVOKE_HTML });
  await api.createPub({ slug: "nav-b", content: AUTO_INVOKE_HTML });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("nav-bot");

  await injectAuth(page, user);

  await page.goto("/p/nav-a");
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const frameA = page.frameLocator("iframe").first();
  await expect(frameA.locator("#auto-result")).toHaveText(/^cwd: \//, { timeout: 30_000 });

  await page.goto("/p/nav-b");
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const frameB = page.frameLocator("iframe").first();
  await expect(frameB.locator("#auto-result")).toHaveText(/^cwd: \//, { timeout: 30_000 });

  await frameB.locator("#run-cmd").click();
  await expect(frameB.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 15_000 });
});

/**
 * Test 12: Agent picker — two daemons online, user selects one, commands work.
 */
test("agent picker: two agents, select one, commands work", async ({ page }) => {
  const user = seedUser("Picker User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });
  const user2 = seedExtraApiKey(user);

  await api.createPub({ slug: "picker-e2e", content: AUTO_INVOKE_HTML });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("alpha-bot");

  const cli2 = new CliFixture(user2, convexProxyUrl);
  extraClis.push(cli2);
  await cli2.startDaemon("beta-bot");

  await injectAuth(page, user);
  await page.goto("/p/picker-e2e");

  await expect(page.getByRole("button", { name: "alpha-bot" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "beta-bot" })).toBeVisible();

  await page.getByRole("button", { name: "alpha-bot" }).dispatchEvent("click");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  const canvasFrame = page.frameLocator("iframe").first();

  // Auto-invoke commands queued before agent selection must survive the sessionKey transition
  await expect(canvasFrame.locator("#auto-result")).toHaveText(/^cwd: \//, { timeout: 30_000 });

  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 30_000 });
});

/**
 * Test 13: Multiple auto-invoke commands all resolve after connection.
 * Verifies: canvas fires 2 commands (cwd + whoami) on load → both queue →
 * connection established → both drain and return results.
 */
test("multiple auto-invoke commands all resolve after connection", async ({ page }) => {
  const user = seedUser("Multi Cmd User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({
    slug: "multi-cmd-e2e",
    content: MULTI_AUTO_INVOKE_HTML,
  });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("multi-cmd-bot");

  await injectAuth(page, user);
  await page.goto("/p/multi-cmd-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#result-a")).toHaveText(/^cwd: \//, { timeout: 30_000 });
  await expect(canvasFrame.locator("#result-b")).toHaveText(/^user: \w/, { timeout: 30_000 });

  // Button command should also work after both auto-invokes completed
  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 15_000 });
});

/**
 * Test 14: Agent offline — auto-recovery to remaining agent, commands work.
 * Verifies: 2 agents → pick alpha → commands work → alpha goes offline →
 * beta auto-selected (only 1 remaining) → new WebRTC connection → button command works.
 *
 * Uses toPass retry because the recovery timing (WebRTC disconnect + presence update
 * + new connection) is non-deterministic; each attempt resets the button, clicks,
 * and checks the result.
 */
test("agent offline: recovery to remaining agent, commands work", async ({ page }) => {
  const user = seedUser("Offline User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });
  const user2 = seedExtraApiKey(user);

  await api.createPub({ slug: "offline-e2e", content: AUTO_INVOKE_HTML });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("alpha-bot");

  const cli2 = new CliFixture(user2, convexProxyUrl);
  extraClis.push(cli2);
  await cli2.startDaemon("beta-bot");

  await injectAuth(page, user);
  await page.goto("/p/offline-e2e");

  // 2 agents → picker shown
  await expect(page.getByRole("button", { name: "alpha-bot" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "alpha-bot" }).dispatchEvent("click");

  // Verify auto-invoke works with alpha-bot
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#auto-result")).toHaveText(/^cwd: \//, { timeout: 30_000 });

  // Stop alpha-bot → goOffline API call + daemon exit.
  // Beta-bot is the only agent remaining → browser auto-selects it.
  // Recovery: old WebRTC disconnects → new connection to beta → executor ready.
  cli.stop();

  // Retry clicking the button until the command succeeds via beta-bot.
  // Each attempt resets #btn-result to distinguish stale results from fresh ones.
  await expect(async () => {
    await canvasFrame.locator("#btn-result").evaluate((el) => {
      el.textContent = "waiting";
    });
    await canvasFrame.locator("#run-cmd").click();
    await expect(canvasFrame.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 8_000 });
  }).toPass({ timeout: 90_000 });
});

/**
 * Test 15: Agent picker + canvas update — commands work in the updated canvas.
 * Verifies the combined flow: 2 agents → pick one → initial auto-invoke works →
 * user sends "update canvas" → agent writes new HTML → new auto-invoke + button work.
 *
 * This catches regressions where the multi-agent sessionKey transition interferes
 * with subsequent canvas scope changes.
 */
test("agent picker + canvas update: commands work in new canvas", async ({ page }) => {
  const user = seedUser("Picker Canvas User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });
  const user2 = seedExtraApiKey(user);

  const initialHtml = `<!DOCTYPE html>
<html>
<head><title>Canvas Commands V1</title></head>
<body>
  <div id="auto-result">pending</div>
  <button id="run-cmd" onclick="runCommand()">Run</button>
  <div id="btn-result">waiting</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "v1",
    "functions": [
      {
        "name": "getVersion",
        "returns": "text",
        "executor": { "kind": "shell", "script": "echo 'v1'" }
      }
    ]
  }
  </script>
  <script>
    pub.commands.getVersion().then(function(r) {
      document.getElementById('auto-result').textContent = 'auto: ' + r;
    }).catch(function(e) {
      document.getElementById('auto-result').textContent = 'error: ' + e.message;
    });
    function runCommand() {
      pub.commands.getVersion().then(function(r) {
        document.getElementById('btn-result').textContent = 'btn: ' + r;
      }).catch(function(e) {
        document.getElementById('btn-result').textContent = 'error: ' + e.message;
      });
    }
  </script>
</body>
</html>`;

  await api.createPub({
    slug: "picker-canvas",
    content: initialHtml,
  });

  const v2Html = `<!DOCTYPE html>
<html>
<head><title>Canvas Commands V2</title></head>
<body>
  <div id="auto-result">pending</div>
  <button id="run-cmd" onclick="runCommand()">Run</button>
  <div id="btn-result">waiting</div>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "v2",
    "functions": [
      {
        "name": "getVersion",
        "returns": "text",
        "executor": { "kind": "shell", "script": "echo 'v2'" }
      }
    ]
  }
  </script>
  <script>
    pub.commands.getVersion().then(function(r) {
      document.getElementById('auto-result').textContent = 'auto: ' + r;
    }).catch(function(e) {
      document.getElementById('auto-result').textContent = 'error: ' + e.message;
    });
    function runCommand() {
      pub.commands.getVersion().then(function(r) {
        document.getElementById('btn-result').textContent = 'btn: ' + r;
      }).catch(function(e) {
        document.getElementById('btn-result').textContent = 'error: ' + e.message;
      });
    }
  </script>
</body>
</html>`;
  await addCanvasRule("update canvas", v2Html, "canvas updated");

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("alpha-bot");

  const cli2 = new CliFixture(user2, convexProxyUrl);
  extraClis.push(cli2);
  await cli2.startDaemon("beta-bot");

  await injectAuth(page, user);
  await page.goto("/p/picker-canvas");

  // Pick alpha-bot from the agent picker
  await expect(page.getByRole("button", { name: "alpha-bot" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "alpha-bot" }).dispatchEvent("click");

  const canvasFrame = page.frameLocator("iframe").first();

  // Phase 1: Initial canvas v1 — auto-invoke works after agent selection
  await expect(canvasFrame.locator("#auto-result")).toHaveText("auto: v1", { timeout: 30_000 });

  // Send chat (fill bypasses collapsed bar visibility)
  await sendChat(page, "update canvas");

  // Verify canvas update via iframe — definitive proof the full pipeline works
  await expect(canvasFrame.locator("#auto-result")).toHaveText("auto: v2", { timeout: 30_000 });

  // Phase 2: Button command in new canvas v2 works
  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText("btn: v2", { timeout: 15_000 });
});

/**
 * TURN relay tests.
 *
 * These tests force the browser to use iceTransportPolicy: "relay" via the
 * test proxy. All browser WebRTC traffic must go through the local coturn
 * TURN server. This verifies the TURN path works end-to-end.
 */
test.describe("TURN relay", () => {
  test.beforeEach(async () => {
    await setTransportPolicy("relay");
  });

  test.afterEach(async () => {
    await setTransportPolicy("all");
  });

  test("chat roundtrip via TURN relay", async ({ page }) => {
    const user = seedUser("TURN Chat User");
    const { convexProxyUrl } = getState();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "turn-chat" });
    await addEchoRule("turn test", "echo: turn works");

    cli = new CliFixture(user, convexProxyUrl);
    await cli.startDaemon("turn-bot");

    await injectAuth(page, user);
    await page.goto("/p/turn-chat");

    await waitForConnection(page);
    await sendChat(page, "turn test");

    await expect(page.getByText("echo: turn works")).toBeVisible({ timeout: 30_000 });
  });

  test("cli write via TURN relay", async ({ page }) => {
    const user = seedUser("TURN Write User");
    const { convexProxyUrl } = getState();
    const api = new ApiClient({ user });

    await api.createPub({ slug: "turn-write" });

    cli = new CliFixture(user, convexProxyUrl);
    await cli.startDaemon("turn-write-bot");

    await injectAuth(page, user);
    await page.goto("/p/turn-write");

    await waitForConnection(page);
    await retryWrite(cli, "turn relay message");

    await expect(page.getByText("turn relay message")).toBeVisible({ timeout: 30_000 });
  });
});
