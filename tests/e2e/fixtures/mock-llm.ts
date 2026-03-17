/**
 * Mock LLM fixture for E2E tests.
 *
 * Provides helpers to configure the mock LLM server's response rules
 * during tests. The server runs as a background process in the Docker
 * container (started by docker-entrypoint.sh).
 */

const MOCK_LLM_URL = process.env.MOCK_LLM_URL ?? "http://localhost:4100";

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

interface AddRuleParams {
  /** Substring to match in the last user message */
  match: string;
  /** Tool calls to return (OpenClaw's `exec` tool) */
  toolCalls?: ToolCall[];
  /** Text response (when no tool execution needed) */
  text?: string;
  /** Text to return after tool execution completes */
  afterToolText?: string;
  /** Delay in ms before responding (simulates slow LLM) */
  delayMs?: number;
}

/** Add a response rule to the mock LLM server. */
export async function addRule(params: AddRuleParams): Promise<void> {
  const res = await fetch(`${MOCK_LLM_URL}/admin/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`Failed to add mock LLM rule: ${res.status} ${await res.text()}`);
  }
}

/** Clear all rules from the mock LLM server. */
export async function clearRules(): Promise<void> {
  const res = await fetch(`${MOCK_LLM_URL}/admin/rules`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Failed to clear mock LLM rules: ${res.status} ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Convenience helpers for common patterns
// ---------------------------------------------------------------------------

/**
 * Add a rule that makes the agent execute a shell command via `pub write`.
 * This is the most common pattern: user says X → agent runs `pub write "Y"`.
 */
export function addEchoRule(match: string, reply: string): Promise<void> {
  return addRule({
    match,
    toolCalls: [{ name: "exec", input: { command: `pub write "${reply}"` } }],
    afterToolText: "done",
  });
}

/**
 * Add a rule that makes the agent update the canvas with HTML content.
 * The HTML is base64-encoded, decoded to a temp file, then sent via `pub write -c canvas -f`.
 * All commands are chained with && to ensure sequential execution.
 */
export function addCanvasRule(match: string, html: string, chatReply?: string): Promise<void> {
  const tmpFile = `/tmp/mock-canvas-${Date.now()}.html`;
  const b64 = Buffer.from(html).toString("base64");

  const parts = [`echo '${b64}' | base64 -d > ${tmpFile}`, `pub write -c canvas -f ${tmpFile}`];
  if (chatReply) {
    parts.push(`pub write "${chatReply}"`);
  }

  return addRule({
    match,
    toolCalls: [{ name: "exec", input: { command: parts.join(" && ") } }],
    afterToolText: "done",
  });
}

/**
 * Add the default "pong" rule for OpenClaw's connectivity probe.
 * Returns a text response instead of tool_use because the self-probe
 * already simulates pong via IPC — OpenClaw doesn't need to execute anything.
 */
export function addPongRule(): Promise<void> {
  return addRule({
    match: 'pub write "pong"',
    text: "Connectivity probe acknowledged.",
  });
}

/**
 * Add a no-op rule for session briefings. The agent acknowledges
 * the briefing without taking action.
 */
export function addBriefingRule(): Promise<void> {
  return addRule({
    match: "Session started",
    text: "Session acknowledged. Ready for messages.",
  });
}

/**
 * Set up the standard rules needed for most live session tests:
 * - Pong probe response
 * - Session briefing acknowledgment
 */
export async function setupDefaultRules(): Promise<void> {
  await clearRules();
  await addBriefingRule();
  await addPongRule();
}
