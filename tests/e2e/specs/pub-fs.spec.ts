/**
 * E2E tests for the pub-fs Service Worker virtual filesystem.
 *
 * Validates that generated HTML can inline host files via /__pub_files__/ URLs:
 * - Image loading via <img src="/__pub_files__/...">
 * - Text file access via fetch("/__pub_files__/...")
 * - 404 handling for nonexistent files
 *
 * Uses real OpenClaw + CLI daemon with the full WebRTC live session.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedUser } from "../fixtures/convex";
import { setupDefaultRules } from "../fixtures/mock-llm";

let cli: CliFixture;

/** Temp directory for test files accessible to the CLI daemon. */
let testFilesDir: string;

async function waitForConnection(page: Page) {
  const textbox = page.getByRole("textbox", { name: "Message" });
  await textbox.fill("_");
  await expect(page.getByLabel("Send message")).toBeEnabled({ timeout: 60_000 });
  await page.keyboard.press("Escape");
}

test.beforeEach(async () => {
  clearAll();
  await setupDefaultRules();
  testFilesDir = mkdtempSync(join(tmpdir(), "pub-fs-test-"));
});

test.afterEach(async () => {
  cli?.cleanup();
});

// ---------------------------------------------------------------------------
// Test: fetch a text file via /__pub_files__/
// ---------------------------------------------------------------------------

test("pub-fs: fetch text file returns correct content", async ({ page }) => {
  const testContent = "hello from pub-fs test";
  const testFilePath = join(testFilesDir, "test.txt");
  writeFileSync(testFilePath, testContent);

  const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS Fetch Test</title></head>
<body>
  <div id="result">loading</div>
  <script type="application/pub-command-manifest+json">
  { "manifestId": "pub-fs-fetch-test", "functions": [] }
  </script>
  <script>
    fetch("/__pub_files__${testFilePath}")
      .then(function(r) { return r.text(); })
      .then(function(text) {
        document.getElementById("result").textContent = "ok:" + text;
      })
      .catch(function(e) {
        document.getElementById("result").textContent = "error:" + e.message;
      });
  </script>
</body>
</html>`;

  const user = seedUser("PubFS Fetch User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "pub-fs-fetch", title: "PubFS Fetch", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("pub-fs-fetch-bot");

  await injectAuth(page, user);
  await page.goto("/p/pub-fs-fetch");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#result")).toHaveText(`ok:${testContent}`, {
    timeout: 30_000,
  });
});

// ---------------------------------------------------------------------------
// Test: inline image via <img src="/__pub_files__/...">
// ---------------------------------------------------------------------------

test("pub-fs: inline image loads successfully", async ({ page }) => {
  // Create a minimal 1x1 PNG
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  const imagePath = join(testFilesDir, "pixel.png");
  writeFileSync(imagePath, pngBytes);

  const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS Image Test</title></head>
<body>
  <img id="test-img" src="/__pub_files__${imagePath}" />
  <div id="result">loading</div>
  <script type="application/pub-command-manifest+json">
  { "manifestId": "pub-fs-img-test", "functions": [] }
  </script>
  <script>
    var img = document.getElementById("test-img");
    img.onload = function() {
      document.getElementById("result").textContent = "loaded:" + img.naturalWidth + "x" + img.naturalHeight;
    };
    img.onerror = function() {
      document.getElementById("result").textContent = "error:failed";
    };
  </script>
</body>
</html>`;

  const user = seedUser("PubFS Image User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "pub-fs-img", title: "PubFS Image", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("pub-fs-img-bot");

  await injectAuth(page, user);
  await page.goto("/p/pub-fs-img");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#result")).toHaveText("loaded:1x1", { timeout: 30_000 });
});

// ---------------------------------------------------------------------------
// Test: 404 for nonexistent file
// ---------------------------------------------------------------------------

test("pub-fs: nonexistent file returns error", async ({ page }) => {
  const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS 404 Test</title></head>
<body>
  <div id="result">loading</div>
  <script type="application/pub-command-manifest+json">
  { "manifestId": "pub-fs-404-test", "functions": [] }
  </script>
  <script>
    fetch("/__pub_files__/tmp/nonexistent-pub-fs-test-file-12345.txt")
      .then(function(r) {
        document.getElementById("result").textContent = "status:" + r.status;
      })
      .catch(function(e) {
        document.getElementById("result").textContent = "error:" + e.message;
      });
  </script>
</body>
</html>`;

  const user = seedUser("PubFS 404 User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "pub-fs-404", title: "PubFS 404", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("pub-fs-404-bot");

  await injectAuth(page, user);
  await page.goto("/p/pub-fs-404");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#result")).toHaveText("status:404", { timeout: 30_000 });
});
