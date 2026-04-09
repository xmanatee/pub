/**
 * Lightweight tunnel relay server for E2E tests.
 *
 * Implements the same protocol as the Cloudflare Worker relay:
 * - /daemon?apiKey=...&sessionId=...  — daemon WebSocket (validated via Convex)
 * - /t/{token}/*                      — HTTP proxy through daemon WS
 * - /ws/{token}                       — browser WebSocket forwarded to daemon WS
 * - /health                           — health check
 */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL;
const PORT = parseInt(process.env.TUNNEL_RELAY_PORT ?? "4102", 10);
const ADMIN_PORT = parseInt(process.env.TUNNEL_RELAY_ADMIN_PORT ?? "4103", 10);

if (!CONVEX_SITE_URL) {
  console.error("[tunnel-relay] CONVEX_SITE_URL is required");
  process.exit(1);
}

// ── State ──────────────────────────────────────────────────────

/** @type {Map<string, import("ws").WebSocket>} hostId → daemon WS */
const daemons = new Map();
/** @type {Map<string, import("ws").WebSocket>} hostId → browser WS */
const browsers = new Map();
/** @type {Map<string, { resolve: Function, timer: ReturnType<typeof setTimeout> }>} */
const pending = new Map();

// ── HTTP server ────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    writeCors(res, 204);
    res.end();
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200).end("ok");
    return;
  }

  if (url.pathname.startsWith("/t/")) {
    await handleHttpProxy(req, res, url);
    return;
  }

  res.writeHead(404).end("Not Found");
});

// ── WebSocket server (noServer mode) ───────────────────────────

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/daemon") {
    const apiKey = url.searchParams.get("apiKey");
    const sessionId = url.searchParams.get("sessionId");
    if (!apiKey || !sessionId) {
      socket.destroy();
      return;
    }

    // Upgrade immediately to avoid Bun WebSocket connect timeout,
    // then validate asynchronously and close if validation fails.
    wss.handleUpgrade(req, socket, head, async (ws) => {
      const validation = await validateDaemon(apiKey, sessionId);
      if (!validation) {
        console.log(`[tunnel-relay] daemon validation failed, closing`);
        ws.close(4001, "Validation failed");
        return;
      }

      const { hostId } = validation;
      daemons.set(hostId, ws);
      console.log(`[tunnel-relay] daemon connected (hostId=${hostId})`);

      ws.on("message", (data) => handleDaemonMessage(hostId, data.toString()));
      ws.on("close", (code, reason) => {
        daemons.delete(hostId);
        failPendingForHost(hostId);
        console.log(`[tunnel-relay] daemon disconnected (hostId=${hostId}, code=${code}, reason=${reason?.toString() ?? ""})`);
      });
      ws.on("error", (err) => {
        console.log(`[tunnel-relay] daemon ws error (hostId=${hostId}): ${err.message}`);
      });
    });
    return;
  }

  if (url.pathname.startsWith("/ws/")) {
    const token = url.pathname.split("/")[2];
    if (!token) {
      socket.destroy();
      return;
    }

    const validation = await validateToken(token);
    if (!validation) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const { hostId } = validation;
      browsers.set(hostId, ws);

      ws.on("message", (data) => {
        const daemonWs = daemons.get(hostId);
        if (daemonWs?.readyState === 1) daemonWs.send(data.toString());
      });
      ws.on("close", () => {
        if (browsers.get(hostId) === ws) browsers.delete(hostId);
      });
    });
    return;
  }

  socket.destroy();
});

// ── HTTP proxy ─────────────────────────────────────────────────

async function handleHttpProxy(req, res, url) {
  const parts = url.pathname.split("/");
  const token = parts[2];
  if (!token) {
    writeCors(res, 400);
    res.end("Missing token");
    return;
  }

  const validation = await validateToken(token);
  if (!validation) {
    console.log(`[tunnel-relay] HTTP proxy: token invalid`);
    writeCors(res, 401);
    res.end("Invalid token");
    return;
  }

  const daemonWs = daemons.get(validation.hostId);
  if (!daemonWs || daemonWs.readyState !== 1) {
    console.log(`[tunnel-relay] HTTP proxy: no daemon WS for hostId=${validation.hostId} (daemons=${[...daemons.keys()].join(",")}, readyState=${daemonWs?.readyState})`);
    writeCors(res, 502);
    res.end("Tunnel not connected");
    return;
  }

  console.log(`[tunnel-relay] HTTP proxy: forwarding to daemon hostId=${validation.hostId}`);

  const proxyPath = "/" + parts.slice(3).join("/") + (url.search ?? "");
  const id = Math.random().toString(36).slice(2, 10);

  const bodyChunks = [];
  for await (const chunk of req) bodyChunks.push(chunk);
  const bodyBuf = Buffer.concat(bodyChunks);

  const headers = {};
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const key = req.rawHeaders[i].toLowerCase();
    if (key === "host" || key === "connection" || key === "upgrade") continue;
    headers[req.rawHeaders[i]] = req.rawHeaders[i + 1];
  }

  daemonWs.send(
    JSON.stringify({
      type: "http-request",
      id,
      method: req.method,
      path: proxyPath,
      headers,
      body: bodyBuf.length > 0 ? bodyBuf.toString("base64") : undefined,
    }),
  );

  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ status: 504, headers: {}, body: null });
    }, 30_000);
    pending.set(id, { resolve, timer });
  });

  const outHeaders = { ...result.headers, "Access-Control-Allow-Origin": "*" };
  res.writeHead(result.status, outHeaders);
  res.end(result.body ? Buffer.from(result.body, "base64") : undefined);
}

// ── Daemon message handler ─────────────────────────────────────

function handleDaemonMessage(hostId, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.log(`[tunnel-relay] daemon message parse error (hostId=${hostId}, raw=${raw.slice(0, 100)})`);
    return;
  }

  console.log(`[tunnel-relay] daemon message: type=${msg.type} id=${msg.id ?? ""} (hostId=${hostId})`);

  if (msg.type === "http-response") {
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    entry.resolve({ status: msg.status ?? 200, headers: msg.headers ?? {}, body: msg.body });
    return;
  }

  if (msg.type === "http-response-start") {
    const entry = pending.get(msg.id);
    if (!entry) return;
    // Buffer streaming chunks, resolve when done
    entry.streamChunks = [];
    entry.streamStatus = msg.status ?? 200;
    entry.streamHeaders = msg.headers ?? {};
    return;
  }

  if (msg.type === "http-response-chunk") {
    const entry = pending.get(msg.id);
    if (!entry) return;
    if (msg.data) entry.streamChunks.push(msg.data);
    if (msg.done) {
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      const body = entry.streamChunks.length > 0
        ? Buffer.concat(entry.streamChunks.map((c) => Buffer.from(c, "base64"))).toString("base64")
        : null;
      entry.resolve({ status: entry.streamStatus, headers: entry.streamHeaders, body });
    }
    return;
  }

  if (msg.type === "channel" || msg.type === "ws-data" || msg.type === "ws-close" || msg.type === "pong") {
    const browserWs = browsers.get(hostId);
    if (browserWs?.readyState === 1) browserWs.send(raw);
  }
}

function failPendingForHost(_hostId) {
  // In a test relay, we don't track which pending requests belong to which host.
  // The timeout will handle cleanup.
}

// ── Convex validation ──────────────────────────────────────────

async function validateDaemon(apiKey, sessionId) {
  const res = await fetch(`${CONVEX_SITE_URL}/api/v1/tunnel/validate-daemon`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ daemonSessionId: sessionId }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.hostId ? data : null;
}

async function validateToken(token) {
  const res = await fetch(
    `${CONVEX_SITE_URL}/api/v1/tunnel/validate?token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.hostId ? data : null;
}

// ── CORS helper ────────────────────────────────────────────────

function writeCors(res, status) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
}

// ── Admin server (health only) ─────────────────────────────────

const admin = createServer((req, res) => {
  if (req.url === "/admin/health") {
    res.writeHead(200).end("ok");
    return;
  }
  res.writeHead(404).end();
});

// ── Start ──────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[tunnel-relay] listening on :${PORT}`);
});

admin.listen(ADMIN_PORT, () => {
  console.log(`[tunnel-relay] admin on :${ADMIN_PORT}`);
});
