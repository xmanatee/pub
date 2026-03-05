import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  CHANNELS,
  CONTROL_CHANNEL,
  generateMessageId,
} from "../../../shared/bridge-protocol-core";
import { resolveCommandFromPath } from "./command-path.js";
import { errorMessage } from "./cli-error.js";
import { createBridgeEntryQueue } from "./live-bridge-queue.js";
import {
  type BufferedEntry,
  type BridgeRunner,
  type BridgeRunnerConfig,
  type BridgeStatus,
  buildInboundPrompt,
  buildSessionBriefing,
  parseSessionContextMeta,
  readTextChatMessage,
  resolveCanvasReminderEvery,
  shouldIncludeCanvasPolicyReminder,
} from "./live-bridge-shared.js";
import {
  type ActiveStream,
  ensureDirectoryWritable,
  handleAttachmentEntry,
  resolveAttachmentMaxBytes,
  resolveAttachmentRootDir,
} from "./live-bridge-openclaw-attachments.js";
import {
  resolveSessionFromOpenClaw,
} from "./live-bridge-openclaw-session.js";

const execFileAsync = promisify(execFile);
const OPENCLAW_DISCOVERY_PATHS = [
  "/app/dist/index.js",
  join(homedir(), "openclaw", "dist", "index.js"),
  join(homedir(), ".openclaw", "openclaw"),
  "/usr/local/bin/openclaw",
  "/opt/homebrew/bin/openclaw",
];

export function isOpenClawAvailable(): boolean {
  const configured = process.env.OPENCLAW_PATH?.trim();
  if (configured) return existsSync(configured);
  const pathFromShell = resolveCommandFromPath("openclaw");
  if (pathFromShell) return true;
  return OPENCLAW_DISCOVERY_PATHS.some((p) => existsSync(p));
}

const MONITORED_ATTACHMENT_CHANNELS = new Set<string>([
  CHANNELS.AUDIO,
  CHANNELS.FILE,
  CHANNELS.MEDIA,
]);

function resolveOpenClawPath(): string {
  const configuredPath = process.env.OPENCLAW_PATH;
  if (configuredPath) {
    if (!existsSync(configuredPath)) {
      throw new Error(`OPENCLAW_PATH does not exist: ${configuredPath}`);
    }
    return configuredPath;
  }

  const pathFromShell = resolveCommandFromPath("openclaw");
  if (pathFromShell) return pathFromShell;

  for (const candidate of OPENCLAW_DISCOVERY_PATHS) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    [
      "OpenClaw executable was not found.",
      "Configure it with: pubblue configure --set openclaw.path=/absolute/path/to/openclaw",
      "Or set OPENCLAW_PATH in environment.",
      `Checked: ${OPENCLAW_DISCOVERY_PATHS.join(", ")}`,
    ].join(" "),
  );
}

function getOpenClawInvocation(
  openclawPath: string,
  args: string[],
): { cmd: string; args: string[] } {
  if (openclawPath.endsWith(".js")) {
    return { cmd: process.execPath, args: [openclawPath, ...args] };
  }
  return { cmd: openclawPath, args };
}

function formatExecFailure(prefix: string, error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(`${prefix}: ${String(error)}`);
  }
  const withOutput = error as Error & { stderr?: string | Buffer; stdout?: string | Buffer };
  const stderr =
    typeof withOutput.stderr === "string"
      ? withOutput.stderr.trim()
      : Buffer.isBuffer(withOutput.stderr)
        ? withOutput.stderr.toString("utf-8").trim()
        : "";
  const stdout =
    typeof withOutput.stdout === "string"
      ? withOutput.stdout.trim()
      : Buffer.isBuffer(withOutput.stdout)
        ? withOutput.stdout.toString("utf-8").trim()
        : "";
  const detail = stderr || stdout || error.message;
  return new Error(`${prefix}: ${detail}`);
}

async function runOpenClawPreflight(openclawPath: string): Promise<void> {
  const invocation = getOpenClawInvocation(openclawPath, ["agent", "--help"]);
  try {
    await execFileAsync(invocation.cmd, invocation.args, {
      timeout: 10_000,
    });
  } catch (error) {
    throw formatExecFailure("OpenClaw preflight failed", error);
  }
}

async function deliverMessageToOpenClaw(params: {
  openclawPath: string;
  sessionId: string;
  text: string;
}): Promise<void> {
  const timeoutMs = Number.parseInt(process.env.OPENCLAW_DELIVER_TIMEOUT_MS ?? "", 10);
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120_000;

  const args = ["agent", "--local", "--session-id", params.sessionId, "-m", params.text];

  const shouldDeliver =
    process.env.OPENCLAW_DELIVER === "1" ||
    Boolean(process.env.OPENCLAW_DELIVER_CHANNEL) ||
    Boolean(process.env.OPENCLAW_REPLY_TO);
  if (shouldDeliver) args.push("--deliver");
  if (process.env.OPENCLAW_DELIVER_CHANNEL) {
    args.push("--channel", process.env.OPENCLAW_DELIVER_CHANNEL);
  }
  if (process.env.OPENCLAW_REPLY_TO) {
    args.push("--reply-to", process.env.OPENCLAW_REPLY_TO);
  }

  const invocation = getOpenClawInvocation(params.openclawPath, args);
  const cwd = process.env.PUBBLUE_PROJECT_ROOT || process.cwd();
  try {
    await execFileAsync(invocation.cmd, invocation.args, {
      cwd,
      timeout: effectiveTimeoutMs,
    });
  } catch (error) {
    throw formatExecFailure("OpenClaw delivery failed", error);
  }
}

export async function createOpenClawBridgeRunner(
  config: BridgeRunnerConfig,
): Promise<BridgeRunner> {
  const { slug, debugLog } = config;

  const openclawPath = resolveOpenClawPath();
  const configuredSessionId = process.env.OPENCLAW_SESSION_ID?.trim();
  const resolvedSession = configuredSessionId
    ? {
        attemptedKeys: [],
        sessionId: configuredSessionId,
        sessionKey: "OPENCLAW_SESSION_ID",
        sessionSource: "env" as const,
      }
    : resolveSessionFromOpenClaw(process.env.OPENCLAW_THREAD_ID);

  if (!resolvedSession.sessionId) {
    const details = [
      "OpenClaw session could not be resolved.",
      resolvedSession.attemptedKeys.length > 0
        ? `Attempted keys: ${resolvedSession.attemptedKeys.join(", ")}`
        : "",
      resolvedSession.readError ? `Session lookup error: ${resolvedSession.readError}` : "",
      "Configure one of:",
      "  pubblue configure --set openclaw.sessionId=<session-id>",
      "  pubblue configure --set openclaw.threadId=<thread-id>",
      "Or set OPENCLAW_SESSION_ID / OPENCLAW_THREAD_ID in environment.",
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(details);
  }

  const sessionId = resolvedSession.sessionId;
  const attachmentRoot = resolveAttachmentRootDir();
  const attachmentMaxBytes = resolveAttachmentMaxBytes();
  ensureDirectoryWritable(attachmentRoot);

  await runOpenClawPreflight(openclawPath);

  const activeStreams = new Map<string, ActiveStream>();
  const canvasReminderEvery = resolveCanvasReminderEvery();
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = false;
  let sessionBriefingSent = false;
  const queue = createBridgeEntryQueue({
    onEntry: async (entry: BufferedEntry) => {
      if (
        !sessionBriefingSent &&
        entry.channel === CONTROL_CHANNEL &&
        entry.msg.type === "event" &&
        entry.msg.data === "session-context"
      ) {
        const ctx = parseSessionContextMeta(entry.msg.meta);
        if (ctx) {
          sessionBriefingSent = true;
          const briefing = buildSessionBriefing(slug, ctx, config.instructions);
          await deliverMessageToOpenClaw({ openclawPath, sessionId, text: briefing });
          debugLog("session briefing delivered");
        }
        return;
      }

      const includeCanvasReminder = shouldIncludeCanvasPolicyReminder(
        forwardedMessageCount + 1,
        canvasReminderEvery,
      );
      const chat = readTextChatMessage(entry);
      if (chat) {
        await deliverMessageToOpenClaw({
          openclawPath,
          sessionId,
          text: buildInboundPrompt(slug, chat, includeCanvasReminder, config.instructions),
        });
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({
          channel: entry.channel,
          messageId: entry.msg.id,
          stage: "confirmed",
        });
        return;
      }

      if (!MONITORED_ATTACHMENT_CHANNELS.has(entry.channel)) return;
      const deliveredAttachment = await handleAttachmentEntry({
        activeStreams,
        attachmentMaxBytes,
        attachmentRoot,
        deliverPrompt: async (prompt) => {
          await deliverMessageToOpenClaw({ openclawPath, sessionId, text: prompt });
        },
        entry,
        includeCanvasReminder,
        instructions: config.instructions,
        slug,
      });
      if (deliveredAttachment) {
        forwardedMessageCount += 1;
        const deliveryMessageId =
          entry.msg.type === "stream-end" && typeof entry.msg.meta?.streamId === "string"
            ? entry.msg.meta.streamId
            : entry.msg.id;
        if (entry.msg.type === "binary" || entry.msg.type === "stream-end") {
          config.onDeliveryUpdate?.({
            channel: entry.channel,
            messageId: deliveryMessageId,
            stage: "confirmed",
          });
        }
      }
    },
    onError: (error, entry) => {
      const message = errorMessage(error);
      lastError = message;
      debugLog(`bridge entry processing failed: ${message}`, error);
      const deliveryMessageId =
        entry.msg.type === "stream-end" && typeof entry.msg.meta?.streamId === "string"
          ? entry.msg.meta.streamId
          : entry.msg.id;
      config.onDeliveryUpdate?.({
        channel: entry.channel,
        messageId: deliveryMessageId,
        stage: "failed",
        error: message,
      });
      void config.sendMessage(CHANNELS.CHAT, {
        id: generateMessageId(),
        type: "text",
        data: `Bridge error: ${message}`,
      });
    },
  });

  debugLog(
    `bridge runner started (session=${sessionId}, key=${resolvedSession.sessionKey || "n/a"})`,
  );

  return {
    enqueue: (entries) => queue.enqueue(entries),

    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      await queue.stop();
    },

    status(): BridgeStatus {
      return {
        running: !stopped,
        sessionId,
        sessionKey: resolvedSession.sessionKey,
        sessionSource: resolvedSession.sessionSource,
        lastError,
        forwardedMessages: forwardedMessageCount,
      };
    },
  };
}
