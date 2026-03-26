/**
 * Mock relay fixture for E2E tests (claude-channel bridge).
 *
 * Provides helpers to configure the mock relay server's response rules.
 * The server runs as a background process in the Docker container.
 */

const MOCK_RELAY_URL = process.env.MOCK_RELAY_URL ?? "http://localhost:4101";

interface RelayReply {
  channel: string;
  type?: string;
  data: string;
}

interface AddRelayRuleParams {
  match: string;
  replies: RelayReply[];
}

/** Add a response rule to the mock relay server. */
export async function addRelayRule(params: AddRelayRuleParams): Promise<void> {
  const res = await fetch(`${MOCK_RELAY_URL}/admin/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`Failed to add mock relay rule: ${res.status} ${await res.text()}`);
  }
}

/** Clear all rules from the mock relay server. */
export async function clearRelayRules(): Promise<void> {
  const res = await fetch(`${MOCK_RELAY_URL}/admin/rules`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Failed to clear mock relay rules: ${res.status} ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Relay echo: user says X → relay sends "Y" back on chat channel. */
export function addRelayEchoRule(match: string, reply: string): Promise<void> {
  return addRelayRule({
    match,
    replies: [{ channel: "chat", type: "text", data: reply }],
  });
}

/** Relay canvas update: user says X → relay sends HTML on canvas channel + optional chat reply. */
export function addRelayCanvasRule(match: string, html: string, chatReply?: string): Promise<void> {
  const replies: RelayReply[] = [{ channel: "canvas", type: "html", data: html }];
  if (chatReply) {
    replies.push({ channel: "chat", type: "text", data: chatReply });
  }
  return addRelayRule({ match, replies });
}

/** Set up default rules for claude-channel tests (no special rules needed). */
export async function setupDefaultRelayRules(): Promise<void> {
  await clearRelayRules();
}
