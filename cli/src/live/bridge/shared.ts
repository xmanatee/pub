import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import { CHANNELS } from "../../../../shared/bridge-protocol-core";
import type { LiveAgentActivity } from "../../../../shared/live-runtime-state-core";
import type { BridgeSettings } from "../../core/config/index.js";
import { COMMAND_PROTOCOL_GUIDE, SYSTEM_PROMPT } from "../prompts/index.js";

export type DeliveryUpdate = {
  channel: string;
  messageId: string;
  stage: "confirmed" | "failed";
  error?: string;
};

export type BridgeRunnerConfig = {
  slug: string;
  sessionBriefing: string;
  bridgeSettings: BridgeSettings;
  sendMessage: (channel: string, msg: BridgeMessage) => Promise<boolean>;
  onActivityChange: (activity: LiveAgentActivity) => void;
  onDeliveryUpdate?: (update: DeliveryUpdate) => void;
  onCanvasWrite?: (html: string) => void;
  debugLog: (message: string, error?: unknown) => void;
};

export type BridgeCapabilities = {
  conversational: boolean;
};

export type BridgeStatus = {
  running: boolean;
  sessionId?: string;
  lastError?: string;
  forwardedMessages: number;
};

export type BridgeRunner = {
  capabilities: BridgeCapabilities;
  enqueue(entries: Array<{ channel: string; msg: BridgeMessage }>): void;
  stop(): Promise<void>;
  status(): BridgeStatus;
  invokeAgentCommand?(params: {
    prompt: string;
    output: "text" | "json";
    timeoutMs: number;
    signal: AbortSignal;
  }): Promise<unknown>;
};

export type BufferedEntry = {
  channel: string;
  msg: BridgeMessage;
};

interface SessionBriefingContext {
  title?: string;
  description?: string;
  isPublic: boolean;
  contentFilePath?: string;
  workspaceDir?: string;
}

export function buildInboundPrompt(slug: string, userText: string): string {
  return [`[Live: ${slug}] User message:`, "", userText].join("\n");
}

export function buildBatchedInboundPrompt(slug: string, messages: string[]): string {
  if (messages.length === 1) return buildInboundPrompt(slug, messages[0]);
  const numbered = messages.map((m, i) => `[${i + 1}] ${m}`).join("\n\n");
  return [`[Live: ${slug}] User sent ${messages.length} messages:`, "", numbered].join("\n");
}

export function buildRenderErrorPrompt(slug: string, errorText: string): string {
  const isConsoleError = errorText.startsWith("[console.error]");
  const consoleNote = isConsoleError
    ? "\n- This was captured from console.error, not a runtime exception. Assess severity before acting."
    : "";
  return [
    `[Live: ${slug}] Canvas render error:`,
    "",
    errorText,
    "",
    "---",
    "Treat this as silent maintenance:",
    "- Fix by sending an updated canvas.",
    `- Do not send user-facing chat about this unless blocked or clarifying requirements.${consoleNote}`,
  ].join("\n");
}

export function buildSessionBriefing(slug: string, ctx: SessionBriefingContext): string {
  const lines: string[] = [
    SYSTEM_PROMPT,
    "",
    "---",
    "",
    `[Live: ${slug}] Session started.`,
    "",
    "## Pub Context",
  ];

  lines.push(`- Title: ${ctx.title || "(not set)"}`);
  lines.push(`- Description: ${ctx.description || "(not set)"}`);
  lines.push(`- Visibility: ${ctx.isPublic ? "public" : "private"}`);
  lines.push(`- Canvas: ${ctx.contentFilePath ? "has existing content (only read when asked to do smth)" : "empty"}`);
  if (ctx.workspaceDir) {
    lines.push(
      `- Session workspace: \`${ctx.workspaceDir}\` (prefer canvas file URLs like \`/__pub_files__/_/output.png\` so each pub stays isolated)`,
    );
  }

  if (COMMAND_PROTOCOL_GUIDE.length > 0) {
    lines.push("", COMMAND_PROTOCOL_GUIDE);
  }

  return lines.join("\n");
}

export function prependSystemPrompt(prompt: string): string {
  return [SYSTEM_PROMPT, "", "---", "", prompt].join("\n");
}

export function readTextChatMessage(entry: BufferedEntry): string | null {
  if (entry.channel !== CHANNELS.CHAT) return null;
  const msg = entry.msg;
  if (msg.type !== "text" || typeof msg.data !== "string") return null;
  return msg.data;
}

export function readRenderErrorMessage(entry: BufferedEntry): string | null {
  if (entry.channel !== CHANNELS.RENDER_ERROR) return null;
  const msg = entry.msg;
  if (msg.type !== "text" || typeof msg.data !== "string") return null;
  const value = msg.data.trim();
  return value.length > 0 ? value : null;
}
