/**
 * E2E tests for the pub-fs Service Worker virtual filesystem.
 *
 * Validates that generated HTML can access files inside the active pub
 * workspace via /__pub_files__/_/... URLs:
 * - GET: read existing workspace files (text, image)
 * - PUT: write files into the workspace
 * - GET after PUT: write then read back
 * - GET: range requests + progressive cache
 * - 404: nonexistent workspace file
 *
 * Multi-bridge: tests run with all bridge modes via the full WebRTC live session.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

    test.beforeEach(async () => {
      clearAll();
      await setupBridgeDefaultRules(mode);
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
      const testFilePath = "tmp/test.txt";

      const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS GET Test</title></head>
<body>
  <div id="result">loading</div>
  <script type="application/pub-command-manifest+json">
  { "manifestId": "pub-fs-get-test", "functions": [] }
  </script>
  <script>
    fetch("/__pub_files__/_/${testFilePath}")
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

      await api.createPub({
        slug: "pub-fs-get",
        files: {
          "index.html": html,
          [testFilePath]: testContent,
        },
      });

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
      await cli.startDaemon("pub-fs-get-bot");

      await injectAuth(page, user);
      await page.goto("/p/pub-fs-get");

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
      const imagePath = "tmp/pixel.svg";
      const imageContent = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1">',
        '<rect width="1" height="1" fill="#00aa66"/>',
        "</svg>",
      ].join("");

      const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS Image Test</title></head>
<body>
  <img id="test-img" src="/__pub_files__/_/${imagePath}" />
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

      await api.createPub({
        slug: "pub-fs-img",
        files: {
          "index.html": html,
          [imagePath]: imageContent,
        },
      });

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
      await cli.startDaemon("pub-fs-img-bot");

      await injectAuth(page, user);
      await page.goto("/p/pub-fs-img");

      await waitForConnection(page);

      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#result")).toHaveText("loaded:1x1", { timeout: 30_000 });
    });

    // ---------------------------------------------------------------------------
    // PUT then GET: write a file, read it back
    // ---------------------------------------------------------------------------

    test("pub-fs PUT+GET: write file then read back", async ({ page }) => {
      const workspaceFilePath = "tmp/written.txt";

      const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS PUT Test</title></head>
<body>
  <button id="run" type="button">Run</button>
  <div id="result">booting</div>
  <script type="application/pub-command-manifest+json">
  { "manifestId": "pub-fs-put-test", "functions": [] }
  </script>
  <script>
    document.getElementById("run").addEventListener("click", function() {
      var writePath = "/__pub_files__/_/${workspaceFilePath}";
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
    });
    document.getElementById("result").textContent = "ready";
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

      await waitForConnection(page);

      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#result")).toHaveText("ready", {
        timeout: 10_000,
      });
      await canvasFrame.locator("#run").click();
      await expect(canvasFrame.locator("#result")).toHaveText("ok:hello from PUT", {
        timeout: 30_000,
      });
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
    fetch("/__pub_files__/_/tmp/nonexistent-pub-fs-test-file-12345.txt")
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

      const workspaceFilePath = "tmp/large.bin";
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
  <button id="run" type="button">Run</button>
  <div id="result">booting</div>
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

    function buildFile() {
      var bytes = new Uint8Array(${fileSize});
      for (var i = 0; i < bytes.length; i++) {
        bytes[i] = i & 255;
      }
      return bytes;
    }

    document.getElementById("run").addEventListener("click", function() {
      var url = "/__pub_files__/_/${workspaceFilePath}";
      fetch(url, { method: "PUT", body: buildFile() })
        .then(function(r) {
          if (!r.ok) throw new Error("PUT failed: " + r.status);
          return fetch(url);
        })
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
    });
    document.getElementById("result").textContent = "ready";
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

      await waitForConnection(page);

      const rangeSize = rangeEnd - rangeStart + 1;
      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#result")).toHaveText("ready", {
        timeout: 10_000,
      });
      await canvasFrame.locator("#run").click();
      await expect(canvasFrame.locator("#result")).toHaveText(
        `ok:${fileSize}:${fullHash}:${rangeSize}:${rangeHash}`,
        { timeout: 60_000 },
      );
    });

    test("pub-fs GET: streams direct host PDF and video files without staging", async ({
      page,
    }) => {
      const hostDir = mkdtempSync(join(tmpdir(), "pub-host-media-"));
      const pdfPath = join(hostDir, "sample.pdf");
      const videoPath = join(hostDir, "sample.webm");
      const videoBase64 =
        "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAL8EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggLm7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjIuMy4xMDBXQYxMYXZmNjIuMy4xMDBEiYhAgEAAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIGGapbcuLRWqcgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QCYloA4JCwgSC6gSCagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYyLjMuMTAwc3PWY8CLY8WIGGapbcuLRWpnyKFFo4dFTkNPREVSRIeUTGF2YzYyLjExLjEwMCBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjUyMDAwMDAwMAAfQ7Z1QT3ngQCjpIEAAIAwAgCdASogACAAAEcIhYWIhYSIAgIAB5DzycD+/6tQgKOVgQAoALEBAAEQMAAYABhYL/QACHAAo5WBAFAAsQEAARAwABgAGFgv9AAIcACjlYEAeACxAQABEDAAGAAYWC/0AAhwAKOVgQCgALEBAAEQMAAYABhYL/QACHAAo5WBAMgAsQEAARAwABgAGFgv9AAIcACjlYEA8ACxAQABEDAAGAAYWC/0AAhwABxTu2uRu4+zgQC3iveBAfGCAaPwgQM=";
      const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 1 /Kids [3 0 R] >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 18 Tf 36 110 Td (Pub FS PDF) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000335 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
405
%%EOF
`;
      writeFileSync(pdfPath, pdfContent, "utf-8");
      writeFileSync(videoPath, Buffer.from(videoBase64, "base64"));

      const toPubFsUrl = (absolutePath: string) =>
        `/__pub_files__${absolutePath.split("/").map(encodeURIComponent).join("/")}`;

      const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS Host Media Test</title></head>
<body>
  <video id="video" preload="metadata" src="${toPubFsUrl(videoPath)}"></video>
  <div id="video-result">loading</div>
  <div id="pdf-result">loading</div>
  <script type="application/pub-command-manifest+json">
  { "manifestId": "pub-fs-host-media-test", "functions": [] }
  </script>
  <script>
    var video = document.getElementById("video");
    video.onloadedmetadata = function() {
      document.getElementById("video-result").textContent =
        "ok:" + video.videoWidth + "x" + video.videoHeight;
    };
    video.onerror = function() {
      document.getElementById("video-result").textContent = "error:video";
    };

    fetch("${toPubFsUrl(pdfPath)}")
      .then(function(r) {
        return Promise.all([r.ok, r.headers.get("content-type") || "", r.arrayBuffer()]);
      })
      .then(function(parts) {
        var ok = parts[0], contentType = parts[1], bytes = new Uint8Array(parts[2]);
        var prefix = "";
        for (var i = 0; i < Math.min(bytes.length, 4); i++) prefix += String.fromCharCode(bytes[i]);
        document.getElementById("pdf-result").textContent =
          ok && contentType.indexOf("application/pdf") !== -1 && prefix === "%PDF"
            ? "ok:pdf"
            : "error:pdf";
      })
      .catch(function() {
        document.getElementById("pdf-result").textContent = "error:pdf";
      });
  </script>
</body>
</html>`;

      const user = seedUser("PubFS Host Media User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      try {
        await api.createPub({ slug: "pub-fs-host-media", content: html });

        cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
        await cli.startDaemon("pub-fs-host-media-bot");

        await injectAuth(page, user);
        await page.goto("/p/pub-fs-host-media");

        await waitForConnection(page);

        const canvasFrame = page.frameLocator("iframe").first();
        await expect(canvasFrame.locator("#pdf-result")).toHaveText("ok:pdf", {
          timeout: 30_000,
        });
        await expect(canvasFrame.locator("#video-result")).toHaveText("ok:32x32", {
          timeout: 30_000,
        });
      } finally {
        rmSync(hostDir, { recursive: true, force: true });
      }
    });
  });
}
