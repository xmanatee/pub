/**
 * Full-stack live session E2E tests.
 *
 * Exercises the complete flow: CLI daemon (mock bridge) → Convex → Browser.
 * Each test is self-contained: seeds user, creates pub, starts daemon, connects browser.
 *
 * The mock bridge (`openclaw-like` mode) receives messages as $1 and echoes
 * them back via `pub write`.
 */
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedExtraApiKey, seedUser } from "../fixtures/convex";

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
 * Wait for the WebRTC connection to be established by filling a dummy message
 * and checking the send button becomes enabled, then clearing the input.
 *
 * Uses .fill() instead of .click() because the control bar's fixed positioning
 * with pointer-events-none outer container and the full-viewport canvas iframe
 * cause Playwright's hit-test (elementFromPoint) to find the iframe instead of
 * the textarea. The .fill() method auto-focuses without a hit-test check.
 */
async function waitForConnection(page: Page) {
  const textbox = page.getByRole("textbox", { name: "Message" });
  await textbox.fill("_");
  await expect(page.getByLabel("Send message")).toBeEnabled({ timeout: 60_000 });
  await page.keyboard.press("Escape");
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

test.beforeEach(() => {
  clearAll();
});

test.afterEach(() => {
  cli?.cleanup();
  for (const c of extraClis) c.cleanup();
  extraClis.length = 0;
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

  // Wait for WebRTC connection, then send a message
  await waitForConnection(page);
  await sendChat(page, "hello from browser");

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

  // Wait for WebRTC connection
  await waitForConnection(page);

  // Send a message from the CLI (retry if live session not yet established on daemon side)
  await retryWrite(cli, "hello from CLI");

  // Verify it appears in the browser chat
  await expect(page.getByText("hello from CLI")).toBeVisible({ timeout: 15_000 });
});

/**
 * Test 5: Chat + canvas update in a single session.
 * Verifies the full agent interaction loop:
 *   1. Send "hi" → bridge echoes "echo: hi" in chat
 *   2. Send "update canvas" → bridge writes new HTML via `pub write -c canvas` → canvas iframe updates
 *   3. Bridge also replies "canvas updated" in chat to confirm
 */
test("chat and canvas update in one session", async ({ page }) => {
  const user = seedUser("Combo User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  const initialHtml = `<!DOCTYPE html>
<html><body><h1 id="status">initial</h1></body></html>`;

  await api.createPub({ slug: "combo-e2e", title: "Combo E2E", content: initialHtml });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("combo-bot");

  await injectAuth(page, user);
  await page.goto("/p/combo-e2e");

  await expect(page.getByLabel("Message", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Verify initial canvas content loads in iframe
  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#status")).toHaveText("initial", { timeout: 10_000 });

  // Wait for WebRTC connection
  await waitForConnection(page);

  // Step 1: Send "hi" → expect chat echo
  await sendChat(page, "hi");
  await expect(page.getByText("echo: hi")).toBeVisible({ timeout: 30_000 });

  // Step 2: Send "update canvas" → expect canvas update + chat confirmation
  await sendChat(page, "update canvas");
  await expect(page.getByText("canvas updated")).toBeVisible({ timeout: 30_000 });
  await expect(canvasFrame.locator("#status")).toHaveText("canvas-updated", { timeout: 15_000 });
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

  await api.createPub({ slug: "cmd-e2e", title: "Command E2E", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("cmd-bot");

  await injectAuth(page, user);
  await page.goto("/p/cmd-e2e");

  // Wait for message input (agent auto-selected)
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  // Wait for WebRTC connection before invoking canvas commands
  await waitForConnection(page);

  // The canvas content should be rendered in an iframe
  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#run-cmd")).toBeVisible({ timeout: 10_000 });
  await canvasFrame.locator("#run-cmd").click();

  // Wait for the command result
  await expect(canvasFrame.locator("#result")).toContainText("hello from command", {
    timeout: 15_000,
  });
});

/**
 * Test 7: Canvas stages a managed daemon file, uses its path in a command, then downloads
 * a derived managed file back to the browser.
 */
test("canvas uploads and downloads managed files through the daemon", async ({ page }) => {
  const user = seedUser("Canvas File User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  const html = `<!DOCTYPE html>
<html>
<head><title>Canvas File Transfer Test</title></head>
<body>
  <h1>Canvas File Transfer Test</h1>
  <input id="picker" type="file" />
  <button id="process" type="button" disabled>Process uploaded file</button>
  <button id="download" type="button" disabled>Download processed file</button>
  <div id="upload-status">idle</div>
  <div id="upload-path"></div>
  <pre id="upload-preview"></pre>
  <div id="process-status">idle</div>
  <pre id="process-preview"></pre>
  <script type="application/pub-command-manifest+json">
  {
    "manifestId": "canvas-file-transfer-test",
    "functions": [
      {
        "name": "readFile",
        "description": "Reads a managed file",
        "returns": "text",
        "executor": {
          "kind": "exec",
          "command": "cat",
          "args": ["{{path}}"]
        }
      },
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
    const picker = document.getElementById('picker');
    const processButton = document.getElementById('process');
    const downloadButton = document.getElementById('download');
    const uploadStatus = document.getElementById('upload-status');
    const uploadPath = document.getElementById('upload-path');
    const uploadPreview = document.getElementById('upload-preview');
    const processStatus = document.getElementById('process-status');
    const processPreview = document.getElementById('process-preview');

    let uploadedPath = '';
    let processedPath = '';

    picker.addEventListener('change', async () => {
      const file = picker.files && picker.files[0];
      if (!file) {
        uploadStatus.textContent = 'missing-file';
        return;
      }

      uploadStatus.textContent = 'uploading';
      processStatus.textContent = 'idle';
      uploadPath.textContent = '';
      uploadPreview.textContent = '';
      processPreview.textContent = '';
      uploadedPath = '';
      processedPath = '';
      processButton.disabled = true;
      downloadButton.disabled = true;

      try {
        const uploaded = await window.pub.files.upload(file);
        uploadedPath = uploaded.path || '';
        uploadPath.textContent = uploadedPath;
        uploadPreview.textContent = await window.pub.command('readFile', { path: uploadedPath });
        uploadStatus.textContent = 'uploaded';
        processButton.disabled = uploadedPath.length === 0;
      } catch (error) {
        uploadStatus.textContent = 'upload-error:' + (error instanceof Error ? error.message : String(error));
      }
    });

    processButton.addEventListener('click', async () => {
      if (!uploadedPath) return;
      processStatus.textContent = 'processing';
      processPreview.textContent = '';
      downloadButton.disabled = true;

      try {
        processedPath = await window.pub.command('uppercaseFile', { path: uploadedPath });
        processPreview.textContent = await window.pub.command('readFile', { path: processedPath });
        processStatus.textContent = 'processed';
        downloadButton.disabled = processedPath.length === 0;
      } catch (error) {
        processStatus.textContent = 'process-error:' + (error instanceof Error ? error.message : String(error));
      }
    });

    downloadButton.addEventListener('click', async () => {
      if (!processedPath) return;
      processStatus.textContent = 'downloading';

      try {
        await window.pub.files.download({ path: processedPath, filename: 'processed.txt' });
        processStatus.textContent = 'downloaded';
      } catch (error) {
        processStatus.textContent = 'download-error:' + (error instanceof Error ? error.message : String(error));
      }
    });
  </script>
</body>
</html>`;

  await api.createPub({ slug: "canvas-files-e2e", title: "Canvas Files E2E", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("canvas-files-bot");

  await injectAuth(page, user);
  await page.goto("/p/canvas-files-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  // Wait for WebRTC connection
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#picker")).toBeVisible({ timeout: 10_000 });

  await canvasFrame.locator("#picker").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello canvas file\n"),
  });

  await expect(canvasFrame.locator("#upload-status")).toHaveText("uploaded", { timeout: 15_000 });
  await expect(canvasFrame.locator("#upload-path")).toContainText("/_canvas/");
  await expect(canvasFrame.locator("#upload-preview")).toContainText("hello canvas file");

  await canvasFrame.locator("#process").click();

  await expect(canvasFrame.locator("#process-status")).toHaveText("processed", { timeout: 15_000 });
  await expect(canvasFrame.locator("#process-preview")).toContainText("HELLO CANVAS FILE");

  const downloadPromise = page.waitForEvent("download");
  await canvasFrame.locator("#download").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("processed.txt");
  await expect(canvasFrame.locator("#process-status")).toHaveText("downloaded", {
    timeout: 15_000,
  });

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect(readFileSync(downloadPath ?? "", "utf-8")).toContain("HELLO CANVAS FILE");
});

/**
 * Test 8: Commands survive canvas HTML updates via full-stack agent flow.
 * Verifies: initial canvas with commands loads → commands work → user sends
 * "update canvas" → mock bridge writes new canvas HTML via `pub write -c canvas` →
 * auto-invoke and button-triggered commands still work with the new manifest.
 *
 * The mock bridge's canvas response is configured via `cli.setCanvasResponse(html)`,
 * so only the agent bridge is mocked — the rest is the real stack.
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
    title: "Command Rebind",
    content: initialHtml,
  });

  cli = new CliFixture(user, convexProxyUrl);

  // Configure mock bridge: when user sends "update canvas", write this HTML
  cli.setCanvasResponse(`<!DOCTYPE html>
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
</html>`);

  await cli.startDaemon("rebind-bot");

  await injectAuth(page, user);
  await page.goto("/p/cmd-rebind");

  await expect(page.getByLabel("Message", { exact: true })).toBeVisible({ timeout: 30_000 });

  const canvasFrame = page.frameLocator("iframe").first();

  // Phase 1: Initial canvas — auto-invoke command works
  await expect(canvasFrame.locator("#auto-result")).toHaveText("auto: v1", { timeout: 30_000 });

  // Phase 1: Button-triggered command works
  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText("btn: v1", { timeout: 15_000 });

  // Phase 2: Send "update canvas" through the browser chat → full stack flow:
  // browser → WebRTC → daemon → mock bridge → pub write -c canvas → Convex → browser
  await sendChat(page, "update canvas");

  // Mock bridge confirms the canvas update in chat
  await expect(page.getByText("canvas updated")).toBeVisible({ timeout: 30_000 });

  // Phase 2: Auto-invoke command in NEW canvas works with updated result
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

/**
 * Test 9: Page reload — commands work after a full page reload.
 * Verifies: canvas loads → auto-invoke resolves → page.reload() → takeover if needed →
 * button-triggered command works.
 *
 * After reload the browser has a new session ID. The server still holds the old
 * live session, so the UI enters "needs-takeover". Once the user takes over,
 * WebRTC reconnects and commands work again.
 */
test("page reload: commands work after reload", async ({ page }) => {
  const user = seedUser("Reload User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "reload-e2e", title: "Reload E2E", content: AUTO_INVOKE_HTML });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("reload-bot");

  await injectAuth(page, user);
  await page.goto("/p/reload-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#auto-result")).toHaveText(/^cwd: \//, { timeout: 30_000 });

  // Button-triggered command also works
  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 15_000 });

  // Reload the page
  await page.reload();

  // After reload, the old live session is still active on the server.
  // The browser may enter "needs-takeover" — handle it if the "Switch here" button appears.
  const switchBtn = page.getByLabel("Switch here");
  const messageInput = page.getByLabel("Message");
  await expect(switchBtn.or(messageInput)).toBeVisible({ timeout: 30_000 });
  if (await switchBtn.isVisible()) {
    await switchBtn.dispatchEvent("click");
  }
  await expect(messageInput).toBeVisible({ timeout: 30_000 });

  // Button-triggered command works after reload + takeover
  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 30_000 });
});

/**
 * Test 10: Takeover — second browser session takes over an active live session.
 * Verifies: page1 goes live → page2 opens same pub → "Switch here" shown →
 * page2 takes over → button-triggered commands work on page2.
 *
 * Auto-invoke commands fired before takeover are lost (scope key change clears
 * the pending queue), so we verify with button-triggered commands after takeover.
 */
test("takeover: second browser takes over and commands work", async ({ page, browser }) => {
  const user = seedUser("Takeover User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "takeover-e2e", title: "Takeover E2E", content: AUTO_INVOKE_HTML });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("takeover-bot");

  // Page 1: establish live session
  await injectAuth(page, user);
  await page.goto("/p/takeover-e2e");
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const frame1 = page.frameLocator("iframe").first();
  await expect(frame1.locator("#auto-result")).toHaveText(/^cwd: \//, { timeout: 30_000 });

  // Page 2: open same pub in a new context
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await injectAuth(page2, user);
  await page2.goto("/p/takeover-e2e");

  // Page 2 should show takeover UI ("Switch here" button)
  await expect(page2.getByLabel("Switch here")).toBeVisible({ timeout: 30_000 });
  await page2.getByLabel("Switch here").dispatchEvent("click");

  // After takeover, page 2 should go live. Button-triggered commands verify the
  // WebRTC connection is established and the command pipeline works.
  await expect(page2.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  const frame2 = page2.frameLocator("iframe").first();
  await frame2.locator("#run-cmd").click();
  await expect(frame2.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 30_000 });

  await context2.close();
});

/**
 * Test 11: Navigate between pubs — auto-invoke commands work on the second pub.
 * Verifies: navigate to pub A → commands work → navigate to pub B → commands work.
 */
test("navigate between pubs: commands work on both", async ({ page }) => {
  const user = seedUser("Navigate User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "nav-a", title: "Nav A", content: AUTO_INVOKE_HTML });
  await api.createPub({ slug: "nav-b", title: "Nav B", content: AUTO_INVOKE_HTML });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("nav-bot");

  await injectAuth(page, user);

  // Visit pub A — commands work
  await page.goto("/p/nav-a");
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const frameA = page.frameLocator("iframe").first();
  await expect(frameA.locator("#auto-result")).toHaveText(/^cwd: \//, { timeout: 30_000 });

  // Navigate to pub B — commands work on the new pub
  await page.goto("/p/nav-b");
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const frameB = page.frameLocator("iframe").first();
  await expect(frameB.locator("#auto-result")).toHaveText(/^cwd: \//, { timeout: 30_000 });

  // Button-triggered command works on pub B
  await frameB.locator("#run-cmd").click();
  await expect(frameB.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 15_000 });
});

/**
 * Test 12: Agent picker — two daemons online, user selects one, commands work.
 * Verifies: 2 agents online → agent picker shown → select agent → button-triggered
 * command works.
 *
 * Auto-invoke commands fired before agent selection are lost (scope key change
 * clears the pending queue), so we verify with button-triggered commands.
 */
test("agent picker: two agents, select one, commands work", async ({ page }) => {
  const user = seedUser("Picker User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });
  const user2 = seedExtraApiKey(user);

  await api.createPub({ slug: "picker-e2e", title: "Picker E2E", content: AUTO_INVOKE_HTML });

  // Start two daemons with different API keys (same user, different agent names)
  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("alpha-bot");

  const cli2 = new CliFixture(user2, convexProxyUrl);
  extraClis.push(cli2);
  await cli2.startDaemon("beta-bot");

  await injectAuth(page, user);
  await page.goto("/p/picker-e2e");

  // With 2 agents online, the TwoAgentLayout shows agent names as buttons
  await expect(page.getByRole("button", { name: "alpha-bot" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "beta-bot" })).toBeVisible();

  // Select the first agent
  await page.getByRole("button", { name: "alpha-bot" }).dispatchEvent("click");

  // After selection, button-triggered command verifies the connection is live
  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  const canvasFrame = page.frameLocator("iframe").first();
  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 30_000 });
});
