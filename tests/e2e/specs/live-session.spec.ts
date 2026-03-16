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
      if (i === maxAttempts - 1 || !String(e).includes("not ready yet")) throw e;
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
  const messageInput = page.getByRole("textbox", { name: "Message" });

  await messageInput.fill("hello from browser");

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
  await page.getByRole("textbox", { name: "Message" }).fill("_");
  await expect(page.getByLabel("Send message")).toBeEnabled({ timeout: 60_000 });
  await page.keyboard.press("Escape");

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

  const messageButton = page.getByLabel("Message", { exact: true });
  const messageTextbox = page.getByRole("textbox", { name: "Message" });
  const sendButton = page.getByLabel("Send message");

  // Helper: click input (button or textarea), fill, send
  async function sendMessage(text: string) {
    // If textarea is visible, use it directly; otherwise click the button to activate
    const isTextbox = await messageTextbox.isVisible().catch(() => false);
    if (isTextbox) {
      await messageTextbox.click();
    } else {
      await messageButton.click();
    }
    await messageTextbox.fill(text);
    await expect(sendButton).toBeEnabled({ timeout: 60_000 });
    await sendButton.click();
  }

  // Wait for WebRTC connection
  await messageButton.click();
  await messageTextbox.fill("_");
  await expect(sendButton).toBeEnabled({ timeout: 60_000 });
  await page.keyboard.press("Escape");

  // Step 1: Send "hi" → expect chat echo
  await sendMessage("hi");
  await expect(page.getByText("echo: hi")).toBeVisible({ timeout: 30_000 });

  // Step 2: Send "update canvas" → expect canvas update + chat confirmation
  await sendMessage("update canvas");
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
  await page.getByLabel("Message").click();
  await page.getByRole("textbox", { name: "Message" }).fill("_");
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

  await page.getByLabel("Message").click();
  await page.getByRole("textbox", { name: "Message" }).fill("_");
  await expect(page.getByLabel("Send message")).toBeEnabled({ timeout: 60_000 });
  await page.keyboard.press("Escape");

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
 * Test 8: Commands survive canvas HTML updates.
 * Verifies: initial canvas with commands loads → commands work → canvas updated with new
 * commands via `pub write -c canvas` → auto-invoke and button-triggered commands still work.
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
  await cli.startDaemon("rebind-bot");

  await injectAuth(page, user);
  await page.goto("/p/cmd-rebind");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });

  const canvasFrame = page.frameLocator("iframe").first();

  // Phase 1: Initial canvas — auto-invoke command works
  await expect(canvasFrame.locator("#auto-result")).toHaveText("auto: v1", { timeout: 30_000 });

  // Phase 1: Button-triggered command works
  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText("btn: v1", { timeout: 15_000 });

  // Phase 2: Update canvas with new HTML that has a DIFFERENT command
  const updatedHtml = `<!DOCTYPE html>
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

  // Write new canvas HTML via daemon IPC (simulates agent updating the canvas)
  await new Promise((r) => setTimeout(r, 1_000));
  cli.writeCanvasHtml(updatedHtml);

  // Phase 2: Auto-invoke command in NEW canvas works with updated result
  await expect(canvasFrame.locator("#auto-result")).toHaveText("auto: v2", { timeout: 30_000 });

  // Phase 2: Button-triggered command in NEW canvas works
  await canvasFrame.locator("#run-cmd").click();
  await expect(canvasFrame.locator("#btn-result")).toHaveText("btn: v2", { timeout: 15_000 });
});
