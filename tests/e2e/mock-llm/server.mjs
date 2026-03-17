/**
 * Mock LLM server for E2E tests.
 *
 * Implements the Anthropic Messages API (POST /v1/messages) with
 * an admin API for dynamic rule configuration during tests.
 *
 * Supports both non-streaming (JSON) and streaming (SSE) responses.
 *
 * Run with: node tests/e2e/mock-llm/server.mjs
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Array<{id: string, match: string, toolCalls?: Array<{name: string, input: object}>, text?: string, afterToolText?: string, delayMs?: number}>} */
const rules = [];
/** @type {Array<{timestamp: string, lastUserText: string, matchedRule: string | null}>} */
const requestLog = [];

// ---------------------------------------------------------------------------
// Rule matching
// ---------------------------------------------------------------------------

function extractLastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      const textBlock = msg.content.find((b) => b.type === "text");
      if (textBlock?.text) return textBlock.text;
    }
  }
  return "";
}

function hasToolResult(messages) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return false;
  if (!Array.isArray(last.content)) return false;
  return last.content.some((b) => b.type === "tool_result");
}

function hasToolResultInMessage(msg) {
  if (!Array.isArray(msg.content)) return false;
  return msg.content.some((b) => b.type === "tool_result");
}

function findMatchingRule(text) {
  for (const rule of rules) {
    if (text.includes(rule.match)) return rule;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Anthropic response builders
// ---------------------------------------------------------------------------

function buildTextMessage(text) {
  return {
    id: `msg_${randomUUID().slice(0, 12)}`,
    type: "message",
    role: "assistant",
    model: "mock-claude",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

function buildToolUseMessage(toolCalls) {
  const content = [];
  for (const tc of toolCalls) {
    content.push({
      type: "tool_use",
      id: `toolu_${randomUUID().slice(0, 12)}`,
      name: tc.name,
      input: tc.input,
    });
  }
  return {
    id: `msg_${randomUUID().slice(0, 12)}`,
    type: "message",
    role: "assistant",
    model: "mock-claude",
    content,
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

// ---------------------------------------------------------------------------
// SSE streaming helpers
// ---------------------------------------------------------------------------

function sseEvent(res, eventType, data) {
  res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
}

function streamTextResponse(res, text) {
  const msgId = `msg_${randomUUID().slice(0, 12)}`;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  sseEvent(res, "message_start", {
    type: "message_start",
    message: {
      id: msgId,
      type: "message",
      role: "assistant",
      model: "mock-claude",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 0 },
    },
  });

  sseEvent(res, "content_block_start", {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  });

  sseEvent(res, "content_block_delta", {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text },
  });

  sseEvent(res, "content_block_stop", {
    type: "content_block_stop",
    index: 0,
  });

  sseEvent(res, "message_delta", {
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: 50 },
  });

  sseEvent(res, "message_stop", { type: "message_stop" });
  res.end();
}

function streamToolUseResponse(res, toolCalls) {
  const msgId = `msg_${randomUUID().slice(0, 12)}`;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  sseEvent(res, "message_start", {
    type: "message_start",
    message: {
      id: msgId,
      type: "message",
      role: "assistant",
      model: "mock-claude",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 0 },
    },
  });

  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i];
    const toolId = `toolu_${randomUUID().slice(0, 12)}`;

    sseEvent(res, "content_block_start", {
      type: "content_block_start",
      index: i,
      content_block: { type: "tool_use", id: toolId, name: tc.name, input: {} },
    });

    sseEvent(res, "content_block_delta", {
      type: "content_block_delta",
      index: i,
      delta: { type: "input_json_delta", partial_json: JSON.stringify(tc.input) },
    });

    sseEvent(res, "content_block_stop", {
      type: "content_block_stop",
      index: i,
    });
  }

  sseEvent(res, "message_delta", {
    type: "message_delta",
    delta: { stop_reason: "tool_use", stop_sequence: null },
    usage: { output_tokens: 50 },
  });

  sseEvent(res, "message_stop", { type: "message_stop" });
  res.end();
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendResponse(res, streaming, message) {
  if (!streaming) {
    json(res, 200, message);
    return;
  }
  if (message.stop_reason === "tool_use") {
    streamToolUseResponse(res, message.content.filter((b) => b.type === "tool_use"));
  } else {
    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    streamTextResponse(res, text);
  }
}

async function handleMessages(req, res) {
  const body = JSON.parse(await readBody(req));
  const messages = body.messages ?? [];
  const streaming = body.stream === true;

  // Log request for debugging
  const msgSummary = messages.map((m) => {
    const contentPreview =
      typeof m.content === "string"
        ? m.content.slice(0, 80)
        : JSON.stringify(m.content).slice(0, 80);
    return `${m.role}: ${contentPreview}`;
  });
  console.error(
    `[mock-llm] POST /v1/messages (${messages.length} msgs, stream=${streaming}): ${msgSummary.join(" | ")}`,
  );

  // If the last message contains tool_result, return afterToolText or "done"
  if (hasToolResult(messages)) {
    const lastUserText = extractLastUserText(
      messages.filter((m) => m.role === "user" && !hasToolResultInMessage(m)),
    );
    const rule = findMatchingRule(lastUserText);
    const afterText = rule?.afterToolText ?? "done";
    console.error(
      `[mock-llm] tool_result detected, matched rule: ${rule?.id ?? "none"}, afterText: ${afterText}`,
    );
    sendResponse(res, streaming, buildTextMessage(afterText));
    return;
  }

  const lastUserText = extractLastUserText(messages);
  const rule = findMatchingRule(lastUserText);
  console.error(
    `[mock-llm] lastUserText: "${lastUserText.slice(0, 100)}" → matched: ${rule?.id ?? "NONE"} (${rules.length} rules)`,
  );

  requestLog.push({
    timestamp: new Date().toISOString(),
    lastUserText: lastUserText.slice(0, 200),
    matchedRule: rule?.id ?? null,
  });

  if (!rule) {
    sendResponse(res, streaming, buildTextMessage("No mock rule matched."));
    return;
  }

  if (rule.delayMs && rule.delayMs > 0) {
    await delay(rule.delayMs);
  }

  if (rule.toolCalls?.length) {
    sendResponse(res, streaming, buildToolUseMessage(rule.toolCalls));
    return;
  }

  sendResponse(res, streaming, buildTextMessage(rule.text ?? "ok"));
}

async function handleRequest(req, res) {
  const url = req.url ?? "";
  const method = req.method ?? "GET";

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-key, anthropic-version",
  );

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === "/v1/messages" && method === "POST") {
    await handleMessages(req, res);
    return;
  }

  if (url === "/admin/rules" && method === "POST") {
    const body = JSON.parse(await readBody(req));
    const rule = {
      id: body.id ?? randomUUID().slice(0, 8),
      match: body.match,
      toolCalls: body.toolCalls,
      text: body.text,
      afterToolText: body.afterToolText,
      delayMs: body.delayMs,
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
    json(res, 200, { status: "ok", rulesCount: rules.length });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const PORT = Number(process.env.MOCK_LLM_PORT ?? 4100);

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error("[mock-llm] Error:", err);
    json(res, 500, { error: String(err) });
  });
});

server.listen(PORT, () => {
  console.log(`[mock-llm] Mock LLM server listening on port ${PORT}`);
});
