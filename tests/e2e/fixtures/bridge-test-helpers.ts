/**
 * Unified bridge test helpers.
 *
 * Dispatches rule configuration to the correct mock backend based on
 * bridge mode. Test specs call these instead of importing mode-specific
 * fixtures directly.
 */
import { type BridgeMode, LLM_BRIDGE_MODES } from "./bridge-configs";
import {
  addCommandCanvasRule,
  addCommandEchoRule,
  clearCommandRules,
  setupDefaultCommandRules,
} from "./mock-command";
import { addCanvasRule, addEchoRule, clearRules, setupDefaultRules } from "./mock-llm";
import {
  addRelayCanvasRule,
  addRelayEchoRule,
  clearRelayRules,
  setupDefaultRelayRules,
} from "./mock-relay";

function isLlmMode(mode: BridgeMode): boolean {
  return (LLM_BRIDGE_MODES as readonly string[]).includes(mode);
}

/** Add an echo rule: user says `match` → agent sends `reply` to chat. */
export async function addBridgeEchoRule(
  mode: BridgeMode,
  match: string,
  reply: string,
): Promise<void> {
  if (isLlmMode(mode)) {
    return addEchoRule(match, reply);
  }
  if (mode === "claude-channel") {
    return addRelayEchoRule(match, reply);
  }
  if (mode === "openclaw-like") {
    addCommandEchoRule(match, reply);
  }
}

/** Add a canvas rule: user says `match` → agent updates canvas with HTML. */
export async function addBridgeCanvasRule(
  mode: BridgeMode,
  match: string,
  html: string,
  chatReply?: string,
): Promise<void> {
  if (isLlmMode(mode)) {
    return addCanvasRule(match, html, mode, chatReply);
  }
  if (mode === "claude-channel") {
    return addRelayCanvasRule(match, html, chatReply);
  }
  if (mode === "openclaw-like") {
    addCommandCanvasRule(match, html, chatReply);
  }
}

/** Set up default rules for the given bridge mode. */
export async function setupBridgeDefaultRules(mode: BridgeMode): Promise<void> {
  if (isLlmMode(mode)) {
    return setupDefaultRules(mode);
  }
  if (mode === "claude-channel") {
    return setupDefaultRelayRules();
  }
  if (mode === "openclaw-like") {
    setupDefaultCommandRules();
  }
}

/** Clear all rules for the given bridge mode. */
export async function clearBridgeRules(mode: BridgeMode): Promise<void> {
  if (isLlmMode(mode)) {
    return clearRules();
  }
  if (mode === "claude-channel") {
    return clearRelayRules();
  }
  if (mode === "openclaw-like") {
    clearCommandRules();
  }
}
