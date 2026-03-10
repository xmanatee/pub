import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { CHANNELS, generateMessageId } from "../../../shared/bridge-protocol-core";
import type { BridgeConfig, PreparedBridgeConfig, PreparedOpenClawConfig } from "./config.js";
import { errorMessage } from "./cli-error.js";
import { resolveCommandFromPath } from "./command-path.js";
import {
  type ActiveStream,
  ensureDirectoryWritable,
  handleAttachmentEntry,
  MONITORED_ATTACHMENT_CHANNELS,
} from "./live-bridge-attachments.js";
import { resolveSessionFromOpenClaw } from "./live-bridge-openclaw-session.js";
import { createBridgeEntryQueue } from "./live-bridge-queue.js";
import {
  type BridgeRunner,
  type BridgeRunnerConfig,
  type BridgeStatus,
  type BufferedEntry,
  buildInboundPrompt,
  buildRenderErrorPrompt,
  readRenderErrorMessage,
  readTextChatMessage,
  shouldIncludeCanvasPolicyReminder,
} from "./live-bridge-shared.js";
import type { BridgeSessionSource } from "./live-bridge-types.js";
import { runAgentWritePongProbe } from "./live-runtime/bridge-write-probe.js";
import { resolveOpenClawHome } from "./openclaw-paths.js";

const execFileAsync = promisify(execFile);
function getOpenClawDiscoveryPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = resolveOpenClawHome(env);
  return [
    ...new Set([
      "/app/dist/index.js",
      join(home, "openclaw", "dist", "index.js"),
      join(home, ".openclaw", "openclaw"),
      "/usr/local/bin/openclaw",
      "/opt/homebrew/bin/openclaw",
    ]),
  ];
}

function getConfiguredOpenClawPath(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.openclawPath;
  return env.OPENCLAW_PATH?.trim();
}

function getConfiguredOpenClawStateDir(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.openclawStateDir;
  return env.OPENCLAW_STATE_DIR?.trim();
}

function getConfiguredOpenClawSessionId(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.sessionId;
  return env.OPENCLAW_SESSION_ID?.trim();
}

function getConfiguredOpenClawThreadId(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.threadId;
  return env.OPENCLAW_THREAD_ID?.trim();
}

function buildOpenClawLookupEnv(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): NodeJS.ProcessEnv {
  const stateDir = getConfiguredOpenClawStateDir(env, bridgeConfig);
  if (!stateDir) return env;
  return {
    ...env,
    OPENCLAW_STATE_DIR: stateDir,
  };
}

export function isOpenClawAvailable(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): boolean {
  const configured = getConfiguredOpenClawPath(env, bridgeConfig);
  if (configured) return existsSync(configured);
  const pathFromShell = resolveCommandFromPath("openclaw");
  if (pathFromShell) return true;
  return getOpenClawDiscoveryPaths(buildOpenClawLookupEnv(env, bridgeConfig)).some((p) =>
    existsSync(p),
  );
}

export function resolveOpenClawPath(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string {
  const configuredPath = getConfiguredOpenClawPath(env, bridgeConfig);
  if (configuredPath) {
    if (!existsSync(configuredPath)) {
      throw new Error(`OPENCLAW_PATH does not exist: ${configuredPath}`);
    }
    return configuredPath;
  }

  const pathFromShell = resolveCommandFromPath("openclaw");
  if (pathFromShell) return pathFromShell;

  const discoveryPaths = getOpenClawDiscoveryPaths(buildOpenClawLookupEnv(env, bridgeConfig));
  for (const candidate of discoveryPaths) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    [
      "OpenClaw executable was not found.",
      "Configure it with: pub config --set openclaw.path=/absolute/path/to/openclaw",
      "Or set OPENCLAW_PATH in environment.",
      `Checked: ${discoveryPaths.join(", ")}`,
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

export async function runOpenClawPreflight(
  openclawPath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const invocation = getOpenClawInvocation(openclawPath, ["agent", "--help"]);
  try {
    await execFileAsync(invocation.cmd, invocation.args, {
      timeout: 10_000,
      env,
    });
  } catch (error) {
    throw formatExecFailure("OpenClaw preflight failed", error);
  }
}

function getPreparedOpenClawCommandCwd(bridgeConfig: PreparedOpenClawConfig): string {
  return bridgeConfig.bridgeCwd;
}

function getAutoDetectOpenClawCommandCwd(env: NodeJS.ProcessEnv = process.env): string {
  const envWorkspace = env.OPENCLAW_WORKSPACE?.trim();
  if (envWorkspace) return envWorkspace;
  throw new Error(
    "OpenClaw workspace is not configured. Set OPENCLAW_WORKSPACE before `pub config --auto`.",
  );
}

export async function deliverMessageToOpenClaw(
  params: {
    openclawPath: string;
    sessionId: string;
    text: string;
  },
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
  options?: { allowEnvFallback?: boolean },
): Promise<void> {
  const parsedTimeoutMs = bridgeConfig?.deliverTimeoutMs;
  const effectiveTimeoutMs =
    typeof parsedTimeoutMs === "number" && Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0
      ? parsedTimeoutMs
      : 120_000;

  const args = ["agent", "--local", "--session-id", params.sessionId, "-m", params.text];

  const shouldDeliver =
    bridgeConfig !== undefined
      ? bridgeConfig.deliver === true || Boolean(bridgeConfig.deliverChannel)
      : options?.allowEnvFallback
        ? env.OPENCLAW_DELIVER === "1" || Boolean(env.OPENCLAW_DELIVER_CHANNEL)
        : false;
  if (shouldDeliver) args.push("--deliver");
  const deliverChannel =
    bridgeConfig !== undefined
      ? bridgeConfig.deliverChannel?.trim()
      : options?.allowEnvFallback
        ? env.OPENCLAW_DELIVER_CHANNEL?.trim()
        : undefined;
  if (deliverChannel) {
    args.push("--channel", deliverChannel);
  }

  const invocation = getOpenClawInvocation(params.openclawPath, args);
  const cwd =
    options?.allowEnvFallback || !bridgeConfig
      ? getAutoDetectOpenClawCommandCwd(env)
      : getPreparedOpenClawCommandCwd(bridgeConfig as PreparedOpenClawConfig);
  try {
    await execFileAsync(invocation.cmd, invocation.args, {
      cwd,
      timeout: effectiveTimeoutMs,
      env,
    });
  } catch (error) {
    throw formatExecFailure("OpenClaw delivery failed", error);
  }
}

export interface OpenClawRuntimeResolution {
  openclawPath: string;
  sessionId: string;
  sessionKey?: string;
  sessionSource?: BridgeSessionSource;
}

export function resolveOpenClawRuntime(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): OpenClawRuntimeResolution {
  const openclawPath = resolveOpenClawPath(env, bridgeConfig);
  const configuredSessionId = getConfiguredOpenClawSessionId(env, bridgeConfig);
  const resolvedSession = configuredSessionId
    ? {
        attemptedKeys: [],
        sessionId: configuredSessionId,
        sessionKey: bridgeConfig ? "openclaw.sessionId" : "OPENCLAW_SESSION_ID",
        sessionSource: bridgeConfig ? ("config" as const) : ("env" as const),
      }
    : resolveSessionFromOpenClaw(
        getConfiguredOpenClawThreadId(env, bridgeConfig),
        buildOpenClawLookupEnv(env, bridgeConfig),
      );

  if (!resolvedSession.sessionId) {
    const details = [
      "OpenClaw session could not be resolved.",
      resolvedSession.attemptedKeys.length > 0
        ? `Attempted keys: ${resolvedSession.attemptedKeys.join(", ")}`
        : "",
      resolvedSession.readError ? `Session lookup error: ${resolvedSession.readError}` : "",
      "Configure one of:",
      "  pub config --set openclaw.sessionId=<session-id>",
      "  pub config --set openclaw.threadId=<thread-id>",
      "Or set OPENCLAW_SESSION_ID / OPENCLAW_THREAD_ID in environment.",
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(details);
  }

  return {
    openclawPath,
    sessionId: resolvedSession.sessionId,
    sessionKey: resolvedSession.sessionKey,
    sessionSource: resolvedSession.sessionSource,
  };
}

export async function runOpenClawBridgeStartupProbe(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig | PreparedBridgeConfig,
  options?: { strictConfig: boolean },
): Promise<OpenClawRuntimeResolution> {
  const strictConfig = options?.strictConfig === true;
  const runtime = strictConfig
    ? {
        openclawPath: (bridgeConfig as PreparedOpenClawConfig).openclawPath,
        sessionId: (bridgeConfig as PreparedOpenClawConfig).sessionId,
        sessionKey: "openclaw.sessionId",
        sessionSource: "config" as const,
      }
    : resolveOpenClawRuntime(env, bridgeConfig);
  if (!runtime.openclawPath || !runtime.sessionId) {
    throw new Error("OpenClaw runtime is not prepared. Run `pub config --auto` again.");
  }
  const allowEnvFallback = !strictConfig;
  await runOpenClawPreflight(runtime.openclawPath, env);
  await runAgentWritePongProbe({
    label: "OpenClaw",
    baseEnv: env,
    execute: async (probeEnv) => {
      await deliverMessageToOpenClaw(
        {
          openclawPath: runtime.openclawPath,
          sessionId: runtime.sessionId,
          text: [
            "[pub preflight] Connectivity probe.",
            "Run this exact command now:",
            'pub write "pong"',
            "Do not explain. Just execute it.",
          ].join("\n"),
        },
        probeEnv,
        bridgeConfig,
        { allowEnvFallback },
      );
    },
  });
  return runtime;
}

export async function createOpenClawBridgeRunner(
  config: BridgeRunnerConfig,
): Promise<BridgeRunner> {
  const { slug, debugLog, sessionBriefing } = config;
  const prepared = config.bridgeConfig;
  if (prepared.mode !== "openclaw") {
    throw new Error("OpenClaw runtime is not prepared.");
  }
  const openclawPath = prepared.openclawPath;
  const sessionId = prepared.sessionId;
  const attachmentRoot = prepared.attachmentDir;
  const attachmentMaxBytes = prepared.attachmentMaxBytes;
  ensureDirectoryWritable(attachmentRoot);

  await runOpenClawPreflight(openclawPath, process.env);

  const activeStreams = new Map<string, ActiveStream>();
  const canvasReminderEvery = prepared.canvasReminderEvery;
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = false;
  await deliverMessageToOpenClaw(
    { openclawPath, sessionId, text: sessionBriefing },
    process.env,
    prepared,
  );
  debugLog("session briefing delivered");

  const queue = createBridgeEntryQueue({
    onEntry: async (entry: BufferedEntry) => {
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
        }, process.env, prepared);
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({
          channel: entry.channel,
          messageId: entry.msg.id,
          stage: "confirmed",
        });
        return;
      }

      const renderError = readRenderErrorMessage(entry);
      if (renderError) {
        await deliverMessageToOpenClaw({
          openclawPath,
          sessionId,
          text: buildRenderErrorPrompt(slug, renderError, config.instructions),
        }, process.env, prepared);
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
          await deliverMessageToOpenClaw(
            { openclawPath, sessionId, text: prompt },
            process.env,
            prepared,
          );
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

  debugLog(`bridge runner started (session=${sessionId})`);

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
        lastError,
        forwardedMessages: forwardedMessageCount,
      };
    },
  };
}
