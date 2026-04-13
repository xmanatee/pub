import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import WebSocket from "ws";
import { ApiClient } from "../fixtures/api";
import { clearAll, seedUser } from "../fixtures/convex";

const RELAY_URL = process.env.TUNNEL_RELAY_URL ?? "http://localhost:4102";

/**
 * A test app served through the tunnel. It:
 * - Renders a React-like UI with client-side JS
 * - Connects to the tunnel WS for channel messages
 * - Sends chat messages via the bridge protocol
 * - Executes commands and displays results
 * - Updates its DOM when it receives messages
 */
function testAppHtml(token: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Tunnel Test App</title>
  <style>body { font-family: sans-serif; margin: 20px; }</style>
</head>
<body>
  <h1 id="heading">Tunnel Test App</h1>
  <div id="status">disconnected</div>
  <div id="chat-log"></div>
  <div id="canvas-content"></div>
  <div id="command-result">pending</div>
  <button id="send-chat" onclick="sendChat()">Send Chat</button>
  <button id="run-cmd" onclick="runCommand()">Run Command</button>
  <script>
    var msgId = 0;
    function nextId() { return 'msg-' + (++msgId); }

    var ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/ws/${token}');

    ws.onopen = function() {
      document.getElementById('status').textContent = 'connected';
    };

    ws.onmessage = function(event) {
      var envelope = JSON.parse(event.data);
      if (envelope.type !== 'channel') return;
      var ch = envelope.channel;
      var msg = envelope.message;

      if (ch === 'chat' && msg.type === 'text') {
        var el = document.createElement('div');
        el.className = 'chat-msg';
        el.textContent = msg.data;
        document.getElementById('chat-log').appendChild(el);
      }

      if (ch === 'canvas' && msg.type === 'html') {
        document.getElementById('canvas-content').innerHTML = msg.data;
      }

      if (ch === '_control' && msg.type === 'event' && msg.data === 'command-result') {
        document.getElementById('command-result').textContent = 'result: ' + (msg.meta && msg.meta.output || 'none');
      }
    };

    function sendChat() {
      ws.send(JSON.stringify({
        type: 'channel',
        channel: 'chat',
        message: { id: nextId(), type: 'text', data: 'hello from tunnel app' }
      }));
    }

    function runCommand() {
      ws.send(JSON.stringify({
        type: 'channel',
        channel: '_control',
        message: { id: nextId(), type: 'event', data: 'command-request', meta: { name: 'greet', args: {} } }
      }));
    }
  </script>
</body>
</html>`;
}

test.describe("Tunnel full-stack E2E", () => {
  let testServer: Server;
  let testServerPort: number;
  let currentToken: string;

  test.beforeAll(async () => {
    testServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(testAppHtml(currentToken));
    });
    await new Promise<void>((resolve) => testServer.listen(0, resolve));
    testServerPort = (testServer.address() as { port: number }).port;
  });

  test.afterAll(() => {
    testServer?.close();
  });

  test.beforeEach(() => {
    clearAll();
  });

  test("app loads and renders through HTTP tunnel proxy", async ({ page }) => {
    const { daemonWs, token, cleanup } = await setupTunnel();
    currentToken = token;
    setupHttpProxy(daemonWs);
    await waitForRelayReady(token);

    await page.goto(`${RELAY_URL}/t/${token}/`);
    await expect(page.locator("#heading")).toHaveText("Tunnel Test App");
    await expect(page.locator("#status")).toHaveText("connected", { timeout: 10_000 });

    await cleanup();
  });

  test("chat round-trip: browser sends, daemon echoes, browser receives", async ({ page }) => {
    const { daemonWs, token, cleanup } = await setupTunnel();
    currentToken = token;
    setupHttpProxy(daemonWs);
    await waitForRelayReady(token);

    daemonWs.on("message", (raw: Buffer) => {
      const envelope = JSON.parse(raw.toString());
      if (envelope.type === "channel" && envelope.channel === "chat") {
        daemonWs.send(
          JSON.stringify({
            type: "channel",
            channel: "chat",
            message: {
              id: `echo-${Date.now()}`,
              type: "text",
              data: `echo: ${envelope.message.data}`,
            },
          }),
        );
      }
    });

    await page.goto(`${RELAY_URL}/t/${token}/`);
    await expect(page.locator("#status")).toHaveText("connected", { timeout: 10_000 });

    await page.locator("#send-chat").click();
    await expect(page.locator(".chat-msg")).toHaveText("echo: hello from tunnel app", {
      timeout: 10_000,
    });

    await cleanup();
  });

  test("canvas update: daemon pushes HTML, browser renders it", async ({ page }) => {
    const { daemonWs, token, cleanup } = await setupTunnel();
    currentToken = token;
    setupHttpProxy(daemonWs);
    await waitForRelayReady(token);

    await page.goto(`${RELAY_URL}/t/${token}/`);
    await expect(page.locator("#status")).toHaveText("connected", { timeout: 10_000 });

    daemonWs.send(
      JSON.stringify({
        type: "channel",
        channel: "canvas",
        message: {
          id: `canvas-${Date.now()}`,
          type: "html",
          data: '<div id="dynamic">Canvas updated by agent</div>',
        },
      }),
    );

    await expect(page.locator("#dynamic")).toHaveText("Canvas updated by agent", {
      timeout: 10_000,
    });

    await cleanup();
  });

  test("command execution: browser requests, daemon responds", async ({ page }) => {
    const { daemonWs, token, cleanup } = await setupTunnel();
    currentToken = token;
    setupHttpProxy(daemonWs);
    await waitForRelayReady(token);

    daemonWs.on("message", (raw: Buffer) => {
      const envelope = JSON.parse(raw.toString());
      if (
        envelope.type === "channel" &&
        envelope.channel === "_control" &&
        envelope.message?.data === "command-request"
      ) {
        daemonWs.send(
          JSON.stringify({
            type: "channel",
            channel: "_control",
            message: {
              id: `cmd-res-${Date.now()}`,
              type: "event",
              data: "command-result",
              meta: { output: "hello from agent" },
            },
          }),
        );
      }
    });

    await page.goto(`${RELAY_URL}/t/${token}/`);
    await expect(page.locator("#status")).toHaveText("connected", { timeout: 10_000 });

    await page.locator("#run-cmd").click();
    await expect(page.locator("#command-result")).toHaveText("result: hello from agent", {
      timeout: 10_000,
    });

    await cleanup();
  });

  test("tunnel returns 502 when daemon disconnects", async () => {
    const { daemonWs, token, cleanup } = await setupTunnel();
    daemonWs.close();
    await new Promise((r) => setTimeout(r, 500));

    const res = await fetch(`${RELAY_URL}/t/${token}/`);
    expect(res.status).toBe(502);

    await cleanup();
  });

  // ── Helpers ────────────────────────────────────────────────────

  async function waitForRelayReady(token: string) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${RELAY_URL}/t/${token}/`);
        if (res.status === 200) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Relay did not become ready within 15s");
  }

  async function setupTunnel() {
    const user = seedUser("Tunnel E2E");
    const api = new ApiClient({ user });
    const sessionId = `tunnel-${Date.now()}`;

    await api.agentOnline({ daemonSessionId: sessionId, agentName: "e2e-tunnel" });
    const { token } = await (await api.registerTunnel({ daemonSessionId: sessionId })).json();

    const params = new URLSearchParams({ apiKey: user.apiKey, sessionId });
    const wsUrl = `${RELAY_URL.replace(/^http/, "ws")}/daemon?${params}`;
    const daemonWs = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      daemonWs.onopen = () => resolve();
      daemonWs.onerror = () => reject(new Error("Daemon WS failed to connect"));
    });

    return {
      daemonWs,
      token,
      cleanup: async () => {
        daemonWs.close();
        await api.closeTunnel({ daemonSessionId: sessionId });
        await api.agentOffline({ daemonSessionId: sessionId });
      },
    };
  }

  function setupHttpProxy(daemonWs: WebSocket) {
    daemonWs.on("message", async (raw: Buffer) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== "http-request") return;

      try {
        const res = await fetch(`http://localhost:${testServerPort}${msg.path}`, {
          method: msg.method,
        });
        const body = Buffer.from(await res.arrayBuffer());
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          headers[k] = v;
        });
        daemonWs.send(
          JSON.stringify({
            type: "http-response",
            id: msg.id,
            status: res.status,
            headers,
            body: body.length > 0 ? body.toString("base64") : undefined,
          }),
        );
      } catch {
        daemonWs.send(
          JSON.stringify({
            type: "http-response",
            id: msg.id,
            status: 502,
            headers: { "content-type": "text/plain" },
            body: Buffer.from("Bad Gateway").toString("base64"),
          }),
        );
      }
    });
  }
});
