/**
 * Mock relay server for E2E tests (claude-channel bridge).
 *
 * Speaks the relay protocol (ndjson over Unix socket) and exposes
 * an HTTP admin API for dynamic rule configuration — same pattern
 * as the mock LLM server.
 *
 * Socket protocol:
 *   Inbound (daemon → relay):  { type: "briefing", slug, content }
 *                               { type: "inbound", channel, msg }
 *   Outbound (relay → daemon): { type: "outbound", channel, msg }
 *                               { type: "activity", state }
 *
 * Run with: node tests/e2e/mock-relay/server.mjs
 */
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Array<{id: string, match: string, replies: Array<{channel: string, type: string, data: string}>}>} */
const rules = [];
/** @type {Array<{timestamp: string, lastText: string, matchedRule: string | null}>} */
const requestLog = [];

// ---------------------------------------------------------------------------
// Rule matching
// ---------------------------------------------------------------------------

function extractTextFromMsg(msg) {
  if (!msg) return "";
  if (typeof msg.data === "string") return msg.data;
  return "";
}

function findMatchingRule(text) {
  for (const rule of rules) {
    if (text.includes(rule.match)) return rule;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Socket server (relay protocol)
// ---------------------------------------------------------------------------

const SOCKET_PATH = process.env.MOCK_RELAY_SOCKET ?? "/tmp/pub-mock-relay.sock";

if (existsSync(SOCKET_PATH)) {
  unlinkSync(SOCKET_PATH);
}

const socketServer = createNetServer((conn) => {
  console.error(`[mock-relay] Client connected`);
  let buffer = "";

  conn.on("data", (chunk) => {
    buffer += chunk.toString("utf-8");
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim().length === 0) continue;
      handleInbound(conn, line);
    }
  });

  conn.on("close", () => {
    console.error(`[mock-relay] Client disconnected`);
  });

  conn.on("error", (err) => {
    console.error(`[mock-relay] Socket error: ${err.message}`);
  });
});

function sendOutbound(conn, msg) {
  conn.write(`${JSON.stringify(msg)}\n`);
}

function handleInbound(conn, line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    console.error(`[mock-relay] Malformed message: ${line.slice(0, 120)}`);
    return;
  }

  if (parsed.type === "briefing") {
    console.error(`[mock-relay] Briefing received for slug: ${parsed.slug}`);
    return;
  }

  if (parsed.type === "inbound") {
    const text = extractTextFromMsg(parsed.msg);
    const rule = findMatchingRule(text);

    console.error(
      `[mock-relay] Inbound on ${parsed.channel}: "${text.slice(0, 100)}" → matched: ${rule?.id ?? "NONE"}`,
    );

    requestLog.push({
      timestamp: new Date().toISOString(),
      lastText: text.slice(0, 200),
      matchedRule: rule?.id ?? null,
    });

    if (!rule) return;

    sendOutbound(conn, { type: "activity", state: "thinking" });

    for (const reply of rule.replies) {
      sendOutbound(conn, {
        type: "outbound",
        channel: reply.channel,
        msg: {
          id: `msg_${randomUUID().slice(0, 12)}`,
          type: reply.type ?? "text",
          data: reply.data,
        },
      });
    }

    sendOutbound(conn, { type: "activity", state: "idle" });
  }
}

socketServer.listen(SOCKET_PATH, () => {
  console.log(`[mock-relay] Socket server listening on ${SOCKET_PATH}`);
});

// ---------------------------------------------------------------------------
// HTTP admin API
// ---------------------------------------------------------------------------

const ADMIN_PORT = Number(process.env.MOCK_RELAY_ADMIN_PORT ?? 4101);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const adminServer = createHttpServer(async (req, res) => {
  const url = req.url ?? "";
  const method = req.method ?? "GET";

  if (url === "/admin/rules" && method === "POST") {
    const body = JSON.parse(await readBody(req));
    const rule = {
      id: body.id ?? randomUUID().slice(0, 8),
      match: body.match,
      replies: body.replies ?? [],
    };
    rules.push(rule);
    json(res, 201, { id: rule.id, rulesCount: rules.length });
    return;
  }

  if (url === "/admin/rules" && method === "DELETE") {
    rules.length = 0;
    requestLog.length = 0;
    json(res, 200, { cleared: true });
    return;
  }

  if (url === "/admin/rules" && method === "GET") {
    json(res, 200, { rules, requestLog });
    return;
  }

  if (url === "/admin/health" && method === "GET") {
    json(res, 200, { status: "ok", rulesCount: rules.length, socketPath: SOCKET_PATH });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

adminServer.listen(ADMIN_PORT, () => {
  console.log(`[mock-relay] Admin API listening on port ${ADMIN_PORT}`);
});
