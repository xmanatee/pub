/**
 * E2E tests for the pub-fs Service Worker virtual filesystem.
 *
 * Validates that generated HTML can access host files via /__pub_files__/ URLs:
 * - GET: read files (text, image)
 * - PUT: write files
 * - GET after PUT: write then read back
 * - 404: nonexistent file
 *
 * Uses real OpenClaw + CLI daemon with the full WebRTC live session.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedUser } from "../fixtures/convex";
import { setupDefaultRules } from "../fixtures/mock-llm";

let cli: CliFixture;
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
// GET: read a text file
// ---------------------------------------------------------------------------

test("pub-fs GET: fetch text file returns correct content", async ({ page }) => {
  const testContent = "hello from pub-fs test";
  const testFilePath = join(testFilesDir, "test.txt");
  writeFileSync(testFilePath, testContent);

  const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS GET Test</title></head>
<body>
  <div id="result">loading</div>
  <script type="application/pub-command-manifest+json">
  { "manifestId": "pub-fs-get-test", "functions": [] }
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

  const user = seedUser("PubFS GET User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "pub-fs-get", title: "PubFS GET", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("pub-fs-get-bot");

  await injectAuth(page, user);
  await page.goto("/p/pub-fs-get");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#result")).toHaveText(`ok:${testContent}`, {
    timeout: 30_000,
  });
});

// ---------------------------------------------------------------------------
// GET: inline image via <img src>
// ---------------------------------------------------------------------------

test("pub-fs GET: inline image loads successfully", async ({ page }) => {
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
// PUT then GET: write a file, read it back
// ---------------------------------------------------------------------------

test("pub-fs PUT+GET: write file then read back", async ({ page }) => {
  const writePath = join(testFilesDir, "written.txt");

  const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS PUT Test</title></head>
<body>
  <div id="result">loading</div>
  <script type="application/pub-command-manifest+json">
  { "manifestId": "pub-fs-put-test", "functions": [] }
  </script>
  <script>
    var writePath = "/__pub_files__${writePath}";
    fetch(writePath, { method: "PUT", body: "hello from PUT" })
      .then(function(r) {
        if (!r.ok) throw new Error("PUT failed: " + r.status);
        return fetch(writePath);
      })
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

  const user = seedUser("PubFS PUT User");
  const { convexProxyUrl } = getState();
  const api = new ApiClient({ user });

  await api.createPub({ slug: "pub-fs-put", title: "PubFS PUT", content: html });

  cli = new CliFixture(user, convexProxyUrl);
  await cli.startDaemon("pub-fs-put-bot");

  await injectAuth(page, user);
  await page.goto("/p/pub-fs-put");

  await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
  await waitForConnection(page);

  const canvasFrame = page.frameLocator("iframe").first();
  await expect(canvasFrame.locator("#result")).toHaveText("ok:hello from PUT", {
    timeout: 30_000,
  });

  // Verify the file was actually written on the host
  expect(readFileSync(writePath, "utf-8")).toBe("hello from PUT");
});

// ---------------------------------------------------------------------------
// GET 404: nonexistent file
// ---------------------------------------------------------------------------

test("pub-fs GET: nonexistent file returns 404", async ({ page }) => {
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
