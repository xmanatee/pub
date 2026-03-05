import type { BridgeMessage, SessionContextPayload } from "../../../shared/bridge-protocol-core";
import { CHANNELS } from "../../../shared/bridge-protocol-core";
import type { BridgeSessionSource } from "./live-bridge-types.js";
import type { BridgeInstructions } from "./live-daemon-shared.js";

const DEFAULT_CANVAS_REMINDER_EVERY = 10;
export const MAX_SEEN_IDS = 10_000;

export interface BridgeRunnerConfig {
  slug: string;
  sendMessage: (channel: string, msg: BridgeMessage) => Promise<boolean>;
  onDeliveryUpdate?: (update: {
    channel: string;
    messageId: string;
    stage: "confirmed" | "failed";
    error?: string;
  }) => void;
  debugLog: (message: string, error?: unknown) => void;
  instructions: BridgeInstructions;
}

export interface BridgeStatus {
  running: boolean;
  sessionId?: string;
  sessionKey?: string;
  sessionSource?: BridgeSessionSource;
  lastError?: string;
  forwardedMessages: number;
}

export interface BridgeRunner {
  enqueue(entries: Array<{ channel: string; msg: BridgeMessage }>): void;
  stop(): Promise<void>;
  status(): BridgeStatus;
}

export interface BufferedEntry {
  channel: string;
  msg: BridgeMessage;
}

export function buildCanvasPolicyReminderBlock(): string {
  return [
    "[Canvas policy reminder: do not reply to this reminder block]",
    "- Prefer canvas for output.",
    "- Use chat for short clarifications, confirmations, or blockers.",
    "- Keep chat concise.",
    "",
  ].join("\n");
}

export function resolveCanvasReminderEvery(): number {
  const raw = Number.parseInt(process.env.OPENCLAW_CANVAS_REMINDER_EVERY ?? "", 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_CANVAS_REMINDER_EVERY;
  return raw;
}

export function shouldIncludeCanvasPolicyReminder(
  forwardedMessageCount: number,
  reminderEvery: number,
): boolean {
  if (!Number.isFinite(reminderEvery) || reminderEvery <= 0) return false;
  if (forwardedMessageCount <= 0) return false;
  return forwardedMessageCount % reminderEvery === 0;
}

export function buildInboundPrompt(
  slug: string,
  userText: string,
  includeCanvasReminder: boolean,
  instructions: BridgeInstructions,
): string {
  const policyReminder = includeCanvasReminder ? buildCanvasPolicyReminderBlock() : "";
  return [
    policyReminder,
    `[Live: ${slug}] User message:`,
    "",
    userText,
    "",
    "---",
    "Respond using:",
    `- ${instructions.replyHint}`,
    `- ${instructions.canvasHint}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRenderErrorPrompt(
  slug: string,
  errorText: string,
  instructions: BridgeInstructions,
): string {
  return [
    `[Live: ${slug}] Canvas render error report:`,
    "",
    errorText,
    "",
    "---",
    "Treat this as silent maintenance:",
    "- Fix by sending an updated canvas payload.",
    "- Do not send user-facing chat about this unless blocked or clarifying requirements.",
    "",
    "Respond using:",
    `- ${instructions.canvasHint}`,
    `- ${instructions.replyHint} (only if blocked)`,
  ].join("\n");
}

export function parseSessionContextMeta(meta: BridgeMessage["meta"]): SessionContextPayload | null {
  if (!meta) return null;
  const payload: SessionContextPayload = {};
  if (typeof meta.title === "string") payload.title = meta.title;
  if (typeof meta.contentType === "string") payload.contentType = meta.contentType;
  if (typeof meta.contentPreview === "string") payload.contentPreview = meta.contentPreview;
  if (typeof meta.isPublic === "boolean") payload.isPublic = meta.isPublic;
  if (meta.preferences && typeof meta.preferences === "object") {
    const prefs = meta.preferences as Record<string, unknown>;
    payload.preferences = {};
    if (typeof prefs.voiceModeEnabled === "boolean") {
      payload.preferences.voiceModeEnabled = prefs.voiceModeEnabled;
    }
  }
  return payload;
}

export function buildSessionBriefing(
  slug: string,
  ctx: SessionContextPayload,
  instructions: BridgeInstructions,
): string {
  const lines: string[] = [
    `[Live: ${slug}] Session started.`,
    "",
    "You are in a live P2P session on pub.blue.",
    "",
    "## Pub Context",
  ];

  if (ctx.title) lines.push(`- Title: ${ctx.title}`);
  if (ctx.contentType) lines.push(`- Content type: ${ctx.contentType}`);
  if (ctx.isPublic !== undefined)
    lines.push(`- Visibility: ${ctx.isPublic ? "public" : "private"}`);
  if (ctx.contentPreview) {
    lines.push("- Content preview:");
    lines.push(ctx.contentPreview);
  }

  if (ctx.preferences) {
    lines.push("", "## User Preferences");
    if (ctx.preferences.voiceModeEnabled !== undefined) {
      lines.push(`- Voice mode: ${ctx.preferences.voiceModeEnabled ? "on" : "off"}`);
    }
  }

  lines.push(
    "",
    "## How to respond",
    `- ${instructions.replyHint}`,
    `- ${instructions.canvasHint}`,
  );

  return lines.join("\n");
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
