/**
 * Bridge test configuration factory.
 *
 * Centralizes all bridge-specific settings for E2E tests: config keys,
 * env vars, and mode groupings. Each bridge mode has a single source of
 * truth here — no bridge-specific logic should leak into fixtures or specs.
 */
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export type BridgeMode =
  | "openclaw"
  | "claude-code"
  | "claude-sdk"
  | "claude-channel"
  | "openclaw-like";

export interface BridgeTestConfig {
  mode: BridgeMode;
  /** Extra keys merged into the `bridge` section of config.json. */
  configExtra: Record<string, unknown>;
  /** Extra env vars added to the CLI process. */
  envExtra: Record<string, string>;
}

const MOCK_LLM_URL = "http://localhost:4100";
const MOCK_RELAY_SOCKET = process.env.MOCK_RELAY_SOCKET ?? "/tmp/pub-mock-relay.sock";
const MOCK_COMMAND_RULES_FILE =
  process.env.MOCK_COMMAND_RULES_FILE ?? "/tmp/mock-command-rules.json";
const MOCK_COMMAND_PATH =
  process.env.MOCK_COMMAND_PATH ??
  fileURLToPath(new URL("../mock-bridge-command/command.mjs", import.meta.url));

export function createBridgeTestConfig(mode: BridgeMode): BridgeTestConfig {
  switch (mode) {
    case "openclaw":
      return {
        mode,
        configExtra: {},
        envExtra: {
          OPENCLAW_PATH: process.env.OPENCLAW_PATH ?? "/usr/local/bin/openclaw",
          OPENCLAW_STATE_DIR: process.env.OPENCLAW_STATE_DIR ?? "/home/node/.openclaw",
          OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE ?? "/home/node/.openclaw/workspace",
          OPENCLAW_SESSION_ID: `e2e-${randomUUID()}`,
        },
      };

    case "claude-code":
    case "claude-sdk":
      return {
        mode,
        configExtra: {
          claudeCodePath: process.env.CLAUDE_CODE_PATH ?? "claude",
        },
        envExtra: {
          ANTHROPIC_BASE_URL: MOCK_LLM_URL,
          ANTHROPIC_API_KEY: "test-key-not-real",
          DISABLE_TELEMETRY: "1",
          DISABLE_AUTOUPDATER: "1",
          DISABLE_ERROR_REPORTING: "1",
        },
      };

    case "claude-channel":
      return {
        mode,
        configExtra: {
          "claude-channel.socketPath": MOCK_RELAY_SOCKET,
        },
        envExtra: {
          PUB_CHANNEL_SOCKET_PATH: MOCK_RELAY_SOCKET,
        },
      };

    case "openclaw-like":
      return {
        mode,
        configExtra: {
          openclawLikeCommand: MOCK_COMMAND_PATH,
        },
        envExtra: {
          PUB_OPENCLAW_LIKE_COMMAND: MOCK_COMMAND_PATH,
          MOCK_COMMAND_RULES_FILE,
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Mode groupings — used by specs to select which bridges to test
// ---------------------------------------------------------------------------

export const ALL_BRIDGE_MODES: BridgeMode[] = [
  "openclaw",
  "claude-code",
  "claude-sdk",
  "claude-channel",
  "openclaw-like",
];

const DEFAULT_BRIDGE_MODES: BridgeMode[] = ["openclaw", "claude-channel", "openclaw-like"];

/** Bridges that talk to the Anthropic Messages API (mock LLM). */
export const LLM_BRIDGE_MODES: BridgeMode[] = ["openclaw", "claude-code", "claude-sdk"];

/** Bridges that can receive a chat message and produce a response. */
export const CHAT_ROUNDTRIP_MODES: BridgeMode[] = [
  "openclaw",
  "claude-code",
  "claude-sdk",
  "claude-channel",
];

/** Bridges that support `invokeAgentCommand` (agent-kind commands). */
export const AGENT_COMMAND_MODES: BridgeMode[] = ["openclaw", "claude-code", "claude-sdk"];

/**
 * Active bridge modes for the current test run.
 * Filter via `BRIDGE_MODES` env var (comma-separated).
 * Defaults to all modes if unset.
 */
export const ACTIVE_BRIDGE_MODES: BridgeMode[] = (() => {
  const raw = process.env.BRIDGE_MODES?.trim();
  if (!raw) return DEFAULT_BRIDGE_MODES;
  const requested = raw.split(",").map((s) => s.trim()) as BridgeMode[];
  return requested.filter((m) => ALL_BRIDGE_MODES.includes(m));
})();

/** Intersection of ACTIVE modes with a category. */
export function activeModes(category: BridgeMode[]): BridgeMode[] {
  return ACTIVE_BRIDGE_MODES.filter((m) => category.includes(m));
}
