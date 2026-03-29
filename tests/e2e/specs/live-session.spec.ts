/**
 * Full-stack live session E2E tests — multi-bridge.
 *
 * Exercises the complete flow for each bridge mode:
 *   CLI daemon → bridge runtime → mock backend → Convex → Browser.
 *
 * Bridge modes tested:
 *   - openclaw, claude-code, claude-sdk → mock LLM (Anthropic Messages API)
 *   - claude-channel → mock relay (ndjson Unix socket)
 *   - openclaw-like → mock command (file-based rules)
 */
import { expect, test } from "@playwright/test";
import { ApiClient } from "../fixtures/api";
import {
  ALL_BRIDGE_MODES,
  activeModes,
  CHAT_ROUNDTRIP_MODES,
  createBridgeTestConfig,
} from "../fixtures/bridge-configs";
import {
  addBridgeCanvasRule,
  addBridgeEchoRule,
  clearBridgeRules,
  setupBridgeDefaultRules,
} from "../fixtures/bridge-test-helpers";
import { injectAuth } from "../fixtures/browser-auth";
import { CliFixture } from "../fixtures/cli";
import { clearAll, getState, seedExtraApiKey, seedUser, type TestUser } from "../fixtures/convex";
import {
  AUTO_INVOKE_HTML,
  MULTI_AUTO_INVOKE_HTML,
  retryWrite,
  sendChat,
  waitForConnection,
} from "../helpers/live-test-utils";
import { setTransportPolicy } from "../helpers/transport-policy";

// ---------------------------------------------------------------------------
// Core tests — run with ALL bridge modes
// ---------------------------------------------------------------------------

for (const mode of activeModes(ALL_BRIDGE_MODES)) {
  test.describe(`[${mode}] core`, () => {
    let cli: CliFixture;
    const extraClis: CliFixture[] = [];

    test.beforeEach(async () => {
      clearAll();
      await setupBridgeDefaultRules(mode);
    });

    test.afterEach(async () => {
      cli?.cleanup();
      for (const c of extraClis) c.cleanup();
      extraClis.length = 0;
      await clearBridgeRules(mode);
    });

    function makeCli(user: TestUser, url: string) {
      return new CliFixture(user, url, createBridgeTestConfig(mode));
    }

    test("lifecycle: start, status, stop", async () => {
      const user = seedUser("Lifecycle User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      expect((await api.createPub({ slug: "lifecycle" })).status).toBe(201);

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("lifecycle-bot");

      const status = cli.getStatus();
      expect(status).toContain("running");
      expect(status).toContain("connected");

      const conflictRes = await api.agentOnline({
        daemonSessionId: "conflict-session",
        agentName: "conflict-bot",
      });
      expect(conflictRes.status).toBeGreaterThanOrEqual(400);

      cli.stop();
      await new Promise((r) => setTimeout(r, 3_000));

      const afterStopRes = await api.agentOnline({
        daemonSessionId: "after-stop",
        agentName: "after-stop-bot",
      });
      expect(afterStopRes.status).toBe(200);
      await api.agentOffline({ daemonSessionId: "after-stop" });
    });

    test("browser detects agent and shows live control bar", async ({ page }) => {
      const user = seedUser("Connection User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      await api.createPub({ slug: "connect-test" });

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("connect-bot");

      await injectAuth(page, user);
      await page.goto("/p/connect-test");

      await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
    });

    test("cli write delivers message to browser", async ({ page }) => {
      const user = seedUser("Write User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      await api.createPub({ slug: "write-e2e" });

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("write-bot");

      await injectAuth(page, user);
      await page.goto("/p/write-e2e");

      await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
      await waitForConnection(page);

      await retryWrite(cli, "hello from CLI");

      await expect(page.getByText("hello from CLI")).toBeVisible({ timeout: 15_000 });
    });

    test("shell command executes via daemon", async ({ page }) => {
      const user = seedUser("Command User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      const html = `<!DOCTYPE html>
<html>
<head><title>Command Test</title></head>
<body>
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

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("cmd-bot");

      await injectAuth(page, user);
      await page.goto("/p/cmd-e2e");

      await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
      await waitForConnection(page);

      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#run-cmd")).toBeVisible({ timeout: 10_000 });
      await expect(async () => {
        await canvasFrame.locator("#result").evaluate((el) => {
          el.textContent = "waiting";
        });
        await canvasFrame.locator("#run-cmd").click();
        await expect(canvasFrame.locator("#result")).toContainText("hello from command", {
          timeout: 8_000,
        });
      }).toPass({
        timeout: 30_000,
      });
    });

    test("pub-fs: write, read, process via command", async ({ page }) => {
      const user = seedUser("PubFS User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      const html = `<!DOCTYPE html>
<html>
<head><title>Pub FS File Transfer Test</title></head>
<body>
  <button id="run" type="button">Run</button>
  <div id="result">booting</div>
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
          "script": "INPUT=\\"{{path}}\\"\\nOUTPUT=\\"$(dirname \\"$INPUT\\")/upper-$(basename \\"$INPUT\\")\\"\\ntr '[:lower:]' '[:upper:]' < \\"$INPUT\\" > \\"$OUTPUT\\"\\nprintf '/_/%s' \\"$OUTPUT\\""
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
        var writePath = '/__pub_files__/_/tmp/pub-fs-e2e-input.txt';
        var putRes = await fetch(writePath, { method: 'PUT', body: 'hello pub fs' });
        if (!putRes.ok) {
          var putBody = await putRes.text();
          throw new Error('PUT failed: ' + putRes.status + ' ' + putBody);
        }
        var readBack = await fetch(writePath).then(function(r) { return r.text(); });
        if (readBack !== 'hello pub fs') throw new Error('read-back mismatch: ' + readBack);
        var processedPath = await pub.command('uppercaseFile', { path: 'tmp/pub-fs-e2e-input.txt' });
        var processed = await fetch('/__pub_files__' + processedPath).then(function(r) { return r.text(); });
        result.textContent = 'ok:' + processed.trim();
      } catch (e) {
        result.textContent = 'error:' + e.message;
      }
    });
    document.getElementById('result').textContent = 'ready';
  </script>
</body>
</html>`;

      await api.createPub({ slug: "pub-fs-e2e", content: html });

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("pub-fs-bot");

      await injectAuth(page, user);
      await page.goto("/p/pub-fs-e2e");

      await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
      await waitForConnection(page);

      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#run")).toBeVisible({ timeout: 10_000 });
      await expect(canvasFrame.locator("#result")).toHaveText("ready", {
        timeout: 10_000,
      });
      await canvasFrame.locator("#run").click();

      await expect(canvasFrame.locator("#result")).toHaveText("ok:HELLO PUB FS", {
        timeout: 30_000,
      });
    });

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

      cli = makeCli(user, convexProxyUrl);
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

    test("takeover: second browser takes over and commands work", async ({ page, browser }) => {
      const user = seedUser("Takeover User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      await api.createPub({ slug: "takeover-e2e", content: AUTO_INVOKE_HTML });

      cli = makeCli(user, convexProxyUrl);
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

    test("navigate between pubs: commands work on both", async ({ page }) => {
      const user = seedUser("Navigate User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      await api.createPub({ slug: "nav-a", content: AUTO_INVOKE_HTML });
      await api.createPub({ slug: "nav-b", content: AUTO_INVOKE_HTML });

      cli = makeCli(user, convexProxyUrl);
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

    test("agent picker: two agents, select one, commands work", async ({ page }) => {
      const user = seedUser("Picker User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });
      const user2 = seedExtraApiKey(user);

      await api.createPub({ slug: "picker-e2e", content: AUTO_INVOKE_HTML });

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("alpha-bot");

      const cli2 = makeCli(user2, convexProxyUrl);
      extraClis.push(cli2);
      await cli2.startDaemon("beta-bot");

      await injectAuth(page, user);
      await page.goto("/p/picker-e2e");

      await expect(page.getByRole("button", { name: "alpha-bot" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("button", { name: "beta-bot" })).toBeVisible();
      await page.getByRole("button", { name: "alpha-bot" }).dispatchEvent("click");

      await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#auto-result")).toHaveText(/^cwd: \//, { timeout: 30_000 });

      await canvasFrame.locator("#run-cmd").click();
      await expect(canvasFrame.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 30_000 });
    });

    test("multiple auto-invoke commands all resolve after connection", async ({ page }) => {
      const user = seedUser("Multi Cmd User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      await api.createPub({ slug: "multi-cmd-e2e", content: MULTI_AUTO_INVOKE_HTML });

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("multi-cmd-bot");

      await injectAuth(page, user);
      await page.goto("/p/multi-cmd-e2e");

      await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#result-a")).toHaveText(/^cwd: \//, { timeout: 30_000 });
      await expect(canvasFrame.locator("#result-b")).toHaveText(/^user: \w/, { timeout: 30_000 });

      await canvasFrame.locator("#run-cmd").click();
      await expect(canvasFrame.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 15_000 });
    });

    test("agent offline: recovery to remaining agent", async ({ page }) => {
      const user = seedUser("Offline User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });
      const user2 = seedExtraApiKey(user);

      await api.createPub({ slug: "offline-e2e", content: AUTO_INVOKE_HTML });

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("alpha-bot");

      const cli2 = makeCli(user2, convexProxyUrl);
      extraClis.push(cli2);
      await cli2.startDaemon("beta-bot");

      await injectAuth(page, user);
      await page.goto("/p/offline-e2e");

      await expect(page.getByRole("button", { name: "alpha-bot" })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "alpha-bot" }).dispatchEvent("click");

      await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#auto-result")).toHaveText(/^cwd: \//, { timeout: 30_000 });

      cli.stop();

      await expect(async () => {
        await canvasFrame.locator("#btn-result").evaluate((el) => {
          el.textContent = "waiting";
        });
        await canvasFrame.locator("#run-cmd").click();
        await expect(canvasFrame.locator("#btn-result")).toHaveText(/^btn: \//, { timeout: 8_000 });
      }).toPass({ timeout: 90_000 });
    });
  });
}

// ---------------------------------------------------------------------------
// TURN relay tests — verify WebRTC works via TURN server
// ---------------------------------------------------------------------------

for (const mode of activeModes(CHAT_ROUNDTRIP_MODES)) {
  test.describe(`[${mode}] TURN relay`, () => {
    let cli: CliFixture;

    test.beforeEach(async () => {
      clearAll();
      await setupBridgeDefaultRules(mode);
      await setTransportPolicy("relay");
    });

    test.afterEach(async () => {
      cli?.cleanup();
      await clearBridgeRules(mode);
      await setTransportPolicy("all");
    });

    test("chat roundtrip via TURN relay", async ({ page }) => {
      const user = seedUser("TURN Chat User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      await api.createPub({ slug: "turn-chat" });
      await addBridgeEchoRule(mode, "turn test", "echo: turn works");

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
      await cli.startDaemon("turn-bot");

      await injectAuth(page, user);
      await page.goto("/p/turn-chat");

      await waitForConnection(page);
      await sendChat(page, "turn test");

      await expect(page.getByText("echo: turn works")).toBeVisible({ timeout: 30_000 });
    });
  });
}

for (const mode of activeModes(ALL_BRIDGE_MODES)) {
  test.describe(`[${mode}] TURN relay write`, () => {
    let cli: CliFixture;

    test.beforeEach(async () => {
      clearAll();
      await setupBridgeDefaultRules(mode);
      await setTransportPolicy("relay");
    });

    test.afterEach(async () => {
      cli?.cleanup();
      await clearBridgeRules(mode);
      await setTransportPolicy("all");
    });

    test("cli write via TURN relay", async ({ page }) => {
      const user = seedUser("TURN Write User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      await api.createPub({ slug: "turn-write" });

      cli = new CliFixture(user, convexProxyUrl, createBridgeTestConfig(mode));
      await cli.startDaemon("turn-write-bot");

      await injectAuth(page, user);
      await page.goto("/p/turn-write");

      await waitForConnection(page);
      await retryWrite(cli, "turn relay message");

      await expect(page.getByText("turn relay message")).toBeVisible({ timeout: 30_000 });
    });
  });
}

// ---------------------------------------------------------------------------
// Chat roundtrip tests — bridges that process messages and respond
// ---------------------------------------------------------------------------

for (const mode of activeModes(CHAT_ROUNDTRIP_MODES)) {
  test.describe(`[${mode}] chat`, () => {
    let cli: CliFixture;
    const extraClis: CliFixture[] = [];

    test.beforeEach(async () => {
      clearAll();
      await setupBridgeDefaultRules(mode);
    });

    test.afterEach(async () => {
      cli?.cleanup();
      for (const c of extraClis) c.cleanup();
      extraClis.length = 0;
      await clearBridgeRules(mode);
    });

    function makeCli(user: TestUser, url: string) {
      return new CliFixture(user, url, createBridgeTestConfig(mode));
    }

    test("chat roundtrip: browser to agent and back", async ({ page }) => {
      const user = seedUser("Chat User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      await api.createPub({ slug: "chat-e2e" });
      await addBridgeEchoRule(mode, "hello from browser", "echo: hello from browser");

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("chat-bot");

      await injectAuth(page, user);
      await page.goto("/p/chat-e2e");

      await expect(page.getByLabel("Message")).toBeVisible({ timeout: 30_000 });
      await waitForConnection(page);
      await sendChat(page, "hello from browser");

      await expect(page.getByText("echo: hello from browser")).toBeVisible({ timeout: 30_000 });
    });

    test("chat and canvas update in one session", async ({ page }) => {
      const user = seedUser("Combo User");
      const { convexProxyUrl } = getState();
      const api = new ApiClient({ user });

      const initialHtml = `<!DOCTYPE html>
<html><body><h1 id="status">initial</h1></body></html>`;

      await api.createPub({ slug: "combo-e2e", content: initialHtml });

      await addBridgeCanvasRule(
        mode,
        "update canvas",
        '<html><body><h1 id="status">canvas-updated</h1></body></html>',
        "canvas updated",
      );
      await addBridgeEchoRule(mode, "say hello", "echo: say hello");

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("combo-bot");

      await injectAuth(page, user);
      await page.goto("/p/combo-e2e");

      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#status")).toHaveText("initial", { timeout: 10_000 });

      await waitForConnection(page);

      await sendChat(page, "say hello");
      await retryWrite(cli, "echo: say hello");

      await sendChat(page, "update canvas");
      await expect(canvasFrame.locator("#status")).toHaveText("canvas-updated", {
        timeout: 30_000,
      });
    });

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
  { "manifestId": "v1", "functions": [{ "name": "getVersion", "returns": "text", "executor": { "kind": "shell", "script": "echo 'v1'" } }] }
  </script>
  <script>
    pub.commands.getVersion().then(function(r) { document.getElementById('auto-result').textContent = 'auto: ' + r; }).catch(function(e) { document.getElementById('auto-result').textContent = 'error: ' + e.message; });
    function runCommand() { pub.commands.getVersion().then(function(r) { document.getElementById('btn-result').textContent = 'btn: ' + r; }).catch(function(e) { document.getElementById('btn-result').textContent = 'error: ' + e.message; }); }
  </script>
</body>
</html>`;

      await api.createPub({ slug: "cmd-rebind", content: initialHtml });

      const v2Html = initialHtml.replace(/v1/g, "v2");
      await addBridgeCanvasRule(mode, "update canvas", v2Html, "canvas updated");

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("rebind-bot");

      await injectAuth(page, user);
      await page.goto("/p/cmd-rebind");

      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#auto-result")).toHaveText("auto: v1", { timeout: 30_000 });
      await canvasFrame.locator("#run-cmd").click();
      await expect(canvasFrame.locator("#btn-result")).toHaveText("btn: v1", { timeout: 15_000 });

      await sendChat(page, "update canvas");
      await expect(canvasFrame.locator("#auto-result")).toHaveText("auto: v2", { timeout: 30_000 });
      await canvasFrame.locator("#run-cmd").click();
      await expect(canvasFrame.locator("#btn-result")).toHaveText("btn: v2", { timeout: 15_000 });
    });

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
  { "manifestId": "v1", "functions": [{ "name": "getVersion", "returns": "text", "executor": { "kind": "shell", "script": "echo 'v1'" } }] }
  </script>
  <script>
    pub.commands.getVersion().then(function(r) { document.getElementById('auto-result').textContent = 'auto: ' + r; }).catch(function(e) { document.getElementById('auto-result').textContent = 'error: ' + e.message; });
    function runCommand() { pub.commands.getVersion().then(function(r) { document.getElementById('btn-result').textContent = 'btn: ' + r; }).catch(function(e) { document.getElementById('btn-result').textContent = 'error: ' + e.message; }); }
  </script>
</body>
</html>`;

      await api.createPub({ slug: "picker-canvas", content: initialHtml });

      const v2Html = initialHtml.replace(/v1/g, "v2");
      await addBridgeCanvasRule(mode, "update canvas", v2Html, "canvas updated");

      cli = makeCli(user, convexProxyUrl);
      await cli.startDaemon("alpha-bot");

      const cli2 = makeCli(user2, convexProxyUrl);
      extraClis.push(cli2);
      await cli2.startDaemon("beta-bot");

      await injectAuth(page, user);
      await page.goto("/p/picker-canvas");

      await expect(page.getByRole("button", { name: "alpha-bot" })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "alpha-bot" }).dispatchEvent("click");

      const canvasFrame = page.frameLocator("iframe").first();
      await expect(canvasFrame.locator("#auto-result")).toHaveText("auto: v1", { timeout: 30_000 });

      await sendChat(page, "update canvas");
      await expect(canvasFrame.locator("#auto-result")).toHaveText("auto: v2", { timeout: 30_000 });

      await canvasFrame.locator("#run-cmd").click();
      await expect(canvasFrame.locator("#btn-result")).toHaveText("btn: v2", { timeout: 15_000 });
    });
  });
}
