/**
 * Mock LLM fixture for E2E tests.
 *
 * Provides helpers to configure the mock LLM server's response rules
 * during tests. The server runs as a background process in the Docker
 * container (started by docker-entrypoint.sh).
 *
 * Bridge-mode aware: tool names differ by bridge mode.
 *   - openclaw → "exec"
 *   - claude-code / claude-sdk → "Bash"
 */
import type { BridgeMode } from "./bridge-configs";

const MOCK_LLM_URL = process.env.MOCK_LLM_URL ?? "http://localhost:4100";

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

interface AddRuleParams {
  /** Substring to match in the last user message */
  match: string;
  /** Tool calls to return */
  toolCalls?: ToolCall[];
  /** Text response (when no tool execution needed) */
  text?: string;
  /** Text to return after tool execution completes */
  afterToolText?: string;
  /** Delay in ms before responding (simulates slow LLM) */
  delayMs?: number;
}

/** Resolve the tool name used by a given bridge mode's LLM backend. */
export function toolNameForMode(mode: BridgeMode): string {
  switch (mode) {
    case "openclaw":
      return "exec";
    case "claude-code":
    case "claude-sdk":
      return "Bash";
    default:
      throw new Error(`Bridge mode "${mode}" does not use the mock LLM — no tool name available`);
  }
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
 * Add a rule that replies to the user with a chat message. Chat delivery is
 * bridge-owned: the LLM returns the reply as assistant text, the bridge
 * forwards it to the chat channel.
 */
export function addEchoRule(match: string, reply: string): Promise<void> {
  return addRule({ match, text: reply });
}

/**
 * Add a rule that makes the agent update the canvas with HTML content.
 * Canvas update is agent-driven (`pub write -c canvas -f`). Chat reply, if
 * any, comes back as assistant text after the tool runs — the bridge owns
 * chat delivery.
 */
export function addCanvasRule(
  match: string,
  html: string,
  mode: BridgeMode,
  chatReply?: string,
): Promise<void> {
  const tool = toolNameForMode(mode);
  const tmpFile = `/tmp/mock-canvas-${Date.now()}.html`;
  const b64 = Buffer.from(html).toString("base64");
  const command = `echo '${b64}' | base64 -d > ${tmpFile} && pub write -c canvas -f ${tmpFile}`;

  return addRule({
    match,
    toolCalls: [{ name: tool, input: { command } }],
    ...(chatReply ? { afterToolText: chatReply } : {}),
  });
}

/**
 * Add the default "pong" rule for the bridge connectivity probe.
 * The agent must execute the same `pub write "pong"` command that real bridge
 * probes require; assistant text after the tool call is bridge-delivered chat.
 */
export function addPongRule(mode: BridgeMode): Promise<void> {
  const tool = toolNameForMode(mode);
  return addRule({
    match: 'pub write "pong"',
    toolCalls: [{ name: tool, input: { command: 'pub write "pong"' } }],
    afterToolText: "Connectivity probe acknowledged.",
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
export async function setupDefaultRules(mode: BridgeMode): Promise<void> {
  await clearRules();
  await addBriefingRule();
  await addPongRule(mode);
}
