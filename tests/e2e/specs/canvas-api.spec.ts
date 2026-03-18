/**
 * E2E tests for the `window.pub` canvas API.
 *
 * Covers the untested surface of the canvas bridge:
 * - Agent commands (executor.kind = "agent", mode = "main") — text and JSON return
 * - File upload (pub.files.upload) — programmatic Blob upload
 * - File download (pub.files.download) — download by daemon path
 * - Client-side upload validation (oversized rejection)
 *
 * Uses real OpenClaw with a mock LLM server.
 */
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedUser } from "../fixtures/convex";
import { addRule, clearRules, setupDefaultRules } from "../fixtures/mock-llm";

let cli: CliFixture;

async function waitForConnection(page: Page) {
  const textbox = page.getByRole("textbox", { name: "Message" });
  await textbox.fill("_");
  await expect(page.getByLabel("Send message")).toBeEnabled({ timeout: 60_000 });
  await page.keyboard.press("Escape");
}

test.beforeEach(async () => {
  clearAll();
  await setupDefaultRules();
});

test.afterEach(async () => {
  cli?.cleanup();
  await clearRules();
});

// ---------------------------------------------------------------------------
// Agent command tests
// ---------------------------------------------------------------------------

/** Canvas HTML with agent commands (main mode). */
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

/**
 * Agent command with text return via main-mode bridge.
 * Flow: canvas JS → WebRTC → daemon → OpenClaw → mock LLM → text result → canvas.
 */
test("agent command: text return via main-mode bridge", async ({ page }) => {
  const user = seedUser("Agent Text Cmd User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({
    slug: "agent-text-cmd",
    title: "Agent Text Cmd",
    content: AGENT_COMMAND_HTML,
  });

  await addRule({ match: "Reply with exactly the word:", text: "pineapple" });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("agent-text-bot");

  await injectAuth(page, user);
  await page.goto("/p/agent-text-cmd");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#run-text")).toBeVisible({ timeout: 10_000 });
  await canvasFrame.locator("#run-text").click();

  await expect(canvasFrame.locator("#text-result")).toHaveText("text:pineapple", {
    timeout: 30_000,
  });
});

/**
 * Agent command with JSON return via main-mode bridge.
 * The agent executor's `output: "json"` makes the daemon parse the LLM response as JSON.
 */
test("agent command: JSON return via main-mode bridge", async ({ page }) => {
  const user = seedUser("Agent JSON Cmd User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({
    slug: "agent-json-cmd",
    title: "Agent JSON Cmd",
    content: AGENT_COMMAND_HTML,
  });

  await addRule({ match: "Reply with only this JSON:", text: '{"color":"red","count":3}' });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("agent-json-bot");

  await injectAuth(page, user);
  await page.goto("/p/agent-json-cmd");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#run-json")).toBeVisible({ timeout: 10_000 });
  await canvasFrame.locator("#run-json").click();

  await expect(canvasFrame.locator("#json-result")).toHaveText('json:{"color":"red","count":3}', {
    timeout: 30_000,
  });
});

// ---------------------------------------------------------------------------
// File upload & download tests
// ---------------------------------------------------------------------------

/** Canvas HTML with programmatic file upload and download buttons. */
const FILE_TRANSFER_HTML = `<!DOCTYPE html>
<html>
<head><title>File Transfer Test</title></head>
<body>
  <button id="upload-btn" type="button">Upload</button>
  <div id="upload-result">idle</div>
  <button id="download-btn" type="button" disabled>Download</button>
  <div id="download-result">idle</div>
  <button id="upload-oversized" type="button">Upload Oversized</button>
  <div id="oversized-result">idle</div>
  <script>
    var uploadedFile = null;

    document.getElementById('upload-btn').addEventListener('click', function() {
      document.getElementById('upload-result').textContent = 'uploading';
      var blob = new Blob(['hello from canvas blob'], { type: 'text/plain' });
      pub.files.upload(blob).then(function(result) {
        uploadedFile = result;
        document.getElementById('upload-result').textContent =
          'ok:' + result.mime + ':' + result.size + ':' + (result.path ? 'has-path' : 'no-path');
        document.getElementById('download-btn').disabled = false;
      }).catch(function(e) {
        document.getElementById('upload-result').textContent = 'error:' + e.message;
      });
    });

    document.getElementById('download-btn').addEventListener('click', function() {
      if (!uploadedFile || !uploadedFile.path) return;
      document.getElementById('download-result').textContent = 'downloading';
      pub.files.download({ path: uploadedFile.path, filename: 'canvas-download.txt' })
        .then(function() {
          document.getElementById('download-result').textContent = 'downloaded';
        }).catch(function(e) {
          document.getElementById('download-result').textContent = 'error:' + e.message;
        });
    });

    document.getElementById('upload-oversized').addEventListener('click', function() {
      document.getElementById('oversized-result').textContent = 'uploading';
      var buf = new ArrayBuffer(10 * 1024 * 1024 + 1);
      pub.files.upload(buf).then(function() {
        document.getElementById('oversized-result').textContent = 'unexpected-ok';
      }).catch(function(e) {
        document.getElementById('oversized-result').textContent = 'rejected:' + e.message;
      });
    });
  </script>
</body>
</html>`;

/**
 * Programmatic file upload via pub.files.upload(Blob).
 * Creates a Blob in canvas JS, uploads to daemon, verifies returned metadata.
 */
test("file upload: programmatic Blob upload returns metadata", async ({ page }) => {
  const user = seedUser("File Upload User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({
    slug: "file-upload-e2e",
    title: "File Upload",
    content: FILE_TRANSFER_HTML,
  });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("file-upload-bot");

  await injectAuth(page, user);
  await page.goto("/p/file-upload-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#upload-btn")).toBeVisible({ timeout: 10_000 });
  await canvasFrame.locator("#upload-btn").click();

  // Verify upload metadata: mime=text/plain, size=22 ("hello from canvas blob"), path exists
  await expect(canvasFrame.locator("#upload-result")).toHaveText("ok:text/plain:22:has-path", {
    timeout: 30_000,
  });
});

/**
 * File download via pub.files.download after upload.
 * Upload → get path → download by path → verify browser receives correct file.
 */
test("file download: upload then download returns correct file", async ({ page }) => {
  const user = seedUser("File Download User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({
    slug: "file-download-e2e",
    title: "File Download",
    content: FILE_TRANSFER_HTML,
  });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("file-download-bot");

  await injectAuth(page, user);
  await page.goto("/p/file-download-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();

  // Upload first
  await canvasFrame.locator("#upload-btn").click();
  await expect(canvasFrame.locator("#upload-result")).toContainText("ok:", { timeout: 30_000 });

  // Download the uploaded file
  const downloadPromise = page.waitForEvent("download");
  await canvasFrame.locator("#download-btn").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("canvas-download.txt");
  await expect(canvasFrame.locator("#download-result")).toHaveText("downloaded", {
    timeout: 15_000,
  });

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect(readFileSync(downloadPath ?? "", "utf-8")).toContain("hello from canvas blob");
});

/**
 * Client-side upload validation rejects oversized files.
 * The bridge script validates size before sending — no daemon traffic needed.
 */
test("file upload: rejects oversized input client-side", async ({ page }) => {
  const user = seedUser("Oversized Upload User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({
    slug: "oversized-upload-e2e",
    title: "Oversized Upload",
    content: FILE_TRANSFER_HTML,
  });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("oversized-bot");

  await injectAuth(page, user);
  await page.goto("/p/oversized-upload-e2e");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#upload-oversized")).toBeVisible({ timeout: 10_000 });
  await canvasFrame.locator("#upload-oversized").click();

  await expect(canvasFrame.locator("#oversized-result")).toHaveText(/rejected:.*byte limit/, {
    timeout: 15_000,
  });
});
