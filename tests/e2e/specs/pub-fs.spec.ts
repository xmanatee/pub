/**
 * E2E tests for the pub-fs Service Worker virtual filesystem.
 *
 * Validates that generated HTML can access host files via /__pub_files__/ URLs:
 * - GET: read files (text, image, large binary)
 * - GET: range requests + progressive cache
 * - PUT: write files
 * - GET after PUT: write then read back
 * - 404: nonexistent file
 *
 * Multi-bridge: tests run with all bridge modes via the full WebRTC live session.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import { ALL_BRIDGE_MODES, activeModes, createBridgeTestConfig } from "../fixtures/bridge-configs";
import { clearBridgeRules, setupBridgeDefaultRules } from "../fixtures/bridge-test-helpers";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedUser } from "../fixtures/convex";
import { waitForConnection } from "../helpers/live-test-utils";

for (const mode of activeModes(ALL_BRIDGE_MODES)) {
  test.describe(`[${mode}]`, () => {
    let cli: CliFixture;
    let testFilesDir: string;

    test.beforeEach(async () => {
      clearAll();
      await setupBridgeDefaultRules(mode);
      testFilesDir = mkdtempSync(join(tmpdir(), "pub-fs-test-"));
    });

    test.afterEach(async () => {
      cli?.cleanup();
      await clearBridgeRules(mode);
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

      await api.createPub({ slug: "pub-fs-get", content: html });

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
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

      await api.createPub({ slug: "pub-fs-img", content: html });

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
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

      await api.createPub({ slug: "pub-fs-put", content: html });

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
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

      await api.createPub({ slug: "pub-fs-404", content: html });

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
      await cli.startDaemon("pub-fs-404-bot");

      await injectAuth(page, user);
      await page.goto("/p/pub-fs-404");

      await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
      await waitForConnection(page);

      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#result")).toHaveText("status:404", { timeout: 30_000 });
    });

    test("pub-fs GET: streams 1 MB file and serves range from cache", async ({ page }) => {
      const fileSize = 1024 * 1024;
      const fileData = Buffer.alloc(fileSize);
      for (let i = 0; i < fileSize; i++) {
        fileData[i] = i & 0xff;
      }

      const filePath = join(testFilesDir, "large.bin");
      writeFileSync(filePath, fileData);

      const rangeStart = 64 * 1024;
      const rangeEnd = 128 * 1024 - 1;
      const fullHash = createHash("sha256").update(fileData).digest("hex");
      const rangeHash = createHash("sha256")
        .update(fileData.subarray(rangeStart, rangeEnd + 1))
        .digest("hex");

      const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS Large + Range Test</title></head>
<body>
  <div id="result">loading</div>
  <script type="application/pub-command-manifest+json">
  { "manifestId": "pub-fs-large-test", "functions": [] }
  </script>
  <script>
    function hexHash(buf) {
      return crypto.subtle.digest("SHA-256", buf).then(function(h) {
        var a = new Uint8Array(h), s = "";
        for (var i = 0; i < a.length; i++) s += ("0" + a[i].toString(16)).slice(-2);
        return s;
      });
    }
    var url = "/__pub_files__${filePath}";
    fetch(url)
      .then(function(r) {
        if (!r.ok) throw new Error("Full: HTTP " + r.status);
        return r.arrayBuffer();
      })
      .then(function(buf) {
        return hexHash(buf).then(function(h) { return { size: buf.byteLength, hash: h }; });
      })
      .then(function(full) {
        return fetch(url, { headers: { "Range": "bytes=${rangeStart}-${rangeEnd}" } })
          .then(function(r) {
            if (r.status !== 206) throw new Error("Range: HTTP " + r.status);
            return r.arrayBuffer();
          })
          .then(function(buf) {
            return hexHash(buf).then(function(h) {
              return full.size + ":" + full.hash + ":" + buf.byteLength + ":" + h;
            });
          });
      })
      .then(function(r) {
        document.getElementById("result").textContent = "ok:" + r;
      })
      .catch(function(e) {
        document.getElementById("result").textContent = "error:" + e.message;
      });
  </script>
</body>
</html>`;

      const user = seedUser("PubFS Large User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      await api.createPub({ slug: "pub-fs-large", content: html });

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
      await cli.startDaemon("pub-fs-large-bot");

      await injectAuth(page, user);
      await page.goto("/p/pub-fs-large");

      await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
      await waitForConnection(page);

      const rangeSize = rangeEnd - rangeStart + 1;
      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#result")).toHaveText(
        `ok:${fileSize}:${fullHash}:${rangeSize}:${rangeHash}`,
        { timeout: 60_000 },
      );
    });
  });
}
