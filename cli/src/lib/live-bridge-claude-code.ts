import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { CHANNELS, generateMessageId } from "../../../shared/bridge-protocol-core";
import { errorMessage } from "./cli-error.js";
import { resolveCommandFromPath } from "./command-path.js";
import {
  type ActiveStream,
  ensureDirectoryWritable,
  handleAttachmentEntry,
  MONITORED_ATTACHMENT_CHANNELS,
} from "./live-bridge-attachments.js";
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
import { runAgentWritePongProbe } from "./live-runtime/bridge-write-probe.js";
import type { BridgeConfig, PreparedClaudeBridgeConfig, PreparedBridgeConfig } from "./config.js";

function getConfiguredClaudeCodePath(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.claudeCodePath;
  return env.CLAUDE_CODE_PATH?.trim();
}

function getConfiguredClaudeCodeModel(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.claudeCodeModel;
  return env.CLAUDE_CODE_MODEL?.trim();
}

function getConfiguredClaudeCodeAllowedTools(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.claudeCodeAllowedTools;
  return env.CLAUDE_CODE_ALLOWED_TOOLS?.trim();
}

function getConfiguredClaudeCodeAppendPrompt(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) return bridgeConfig.claudeCodeAppendSystemPrompt;
  return env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT?.trim();
}

function getConfiguredClaudeCodeMaxTurns(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string | undefined {
  if (bridgeConfig) {
    return bridgeConfig.claudeCodeMaxTurns !== undefined
      ? String(bridgeConfig.claudeCodeMaxTurns)
      : undefined;
  }
  return env.CLAUDE_CODE_MAX_TURNS?.trim();
}

export function isClaudeCodeAvailableInEnv(
  env: NodeJS.ProcessEnv,
  bridgeConfig?: BridgeConfig,
): boolean {
  const configured = getConfiguredClaudeCodePath(env, bridgeConfig);
  if (configured) {
    if (existsSync(configured)) return true;
    return resolveCommandFromPath(configured) !== null;
  }
  return resolveCommandFromPath("claude") !== null;
}

export function resolveClaudeCodePath(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string {
  const configured = getConfiguredClaudeCodePath(env, bridgeConfig);
  if (configured) {
    if (existsSync(configured)) return configured;
    const resolvedConfigured = resolveCommandFromPath(configured);
    if (resolvedConfigured) return resolvedConfigured;
    return configured;
  }
  const pathFromShell = resolveCommandFromPath("claude");
  if (pathFromShell) return pathFromShell;
  return "claude";
}

async function runClaudeCodePreflight(
  claudePath: string,
  envInput: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const env = { ...envInput };
  delete env.CLAUDECODE;
  return new Promise((resolve, reject) => {
    const child = spawn(claudePath, ["--version"], { timeout: 10_000, stdio: "pipe", env });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => reject(new Error(`Claude Code preflight failed: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Claude Code preflight failed (exit ${code}): ${stderr.trim()}`));
    });
  });
}

function getAutoDetectClaudeBridgeCwd(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
): string {
  return bridgeConfig?.bridgeCwd?.trim() || env.PUB_PROJECT_ROOT?.trim() || process.cwd();
}

function getStrictClaudeCodePath(bridgeConfig: PreparedClaudeBridgeConfig): string {
  return bridgeConfig.claudeCodePath;
}

function getStrictClaudeBridgeCwd(bridgeConfig: PreparedClaudeBridgeConfig): string {
  return bridgeConfig.bridgeCwd;
}

export function buildClaudeArgs(
  prompt: string,
  sessionId: string | null,
  systemPrompt: string | null,
  env: NodeJS.ProcessEnv = process.env,
  opts?: { maxTurns?: number },
  bridgeConfig?: BridgeConfig,
): string[] {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];
  if (sessionId) args.push("--resume", sessionId);

  const model = getConfiguredClaudeCodeModel(env, bridgeConfig);
  if (model) args.push("--model", model);

  const allowedTools = getConfiguredClaudeCodeAllowedTools(env, bridgeConfig);
  if (allowedTools) args.push("--allowedTools", allowedTools);

  const userSystemPrompt = getConfiguredClaudeCodeAppendPrompt(env, bridgeConfig);
  const effectiveSystemPrompt = [systemPrompt, userSystemPrompt].filter(Boolean).join("\n\n");
  if (effectiveSystemPrompt) args.push("--append-system-prompt", effectiveSystemPrompt);

  if (opts?.maxTurns !== undefined) {
    args.push("--max-turns", String(opts.maxTurns));
  } else {
    const maxTurns = getConfiguredClaudeCodeMaxTurns(env, bridgeConfig);
    if (maxTurns) args.push("--max-turns", maxTurns);
  }

  return args;
}

async function runClaudeCodeWritePongProbe(
  claudePath: string,
  envInput: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig,
  options?: { strictConfig: boolean },
): Promise<void> {
  await runAgentWritePongProbe({
    label: "Claude Code",
    baseEnv: envInput,
    execute: async (probeEnv) => {
      const env = { ...probeEnv };
      delete env.CLAUDECODE;
      const prompt = [
        "This is a startup connectivity probe.",
        "Run this exact shell command now:",
        'pub write "pong"',
        "Do not explain. Just execute it.",
      ].join("\n");
      const args = buildClaudeArgs(prompt, null, null, env, undefined, bridgeConfig);
      if (!args.includes("--max-turns")) args.push("--max-turns", "2");

      const cwd = options?.strictConfig
        ? getStrictClaudeBridgeCwd(bridgeConfig as PreparedClaudeBridgeConfig)
        : getAutoDetectClaudeBridgeCwd(env, bridgeConfig);

      await new Promise<void>((resolve, reject) => {
        const child = spawn(claudePath, args, {
          cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf-8");
        });
        child.on("error", (error) => {
          reject(new Error(`Claude Code ping/pong preflight failed: ${error.message}`));
        });
        child.on("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(
            new Error(
              stderr.trim().length > 0
                ? `Claude Code ping/pong preflight failed (exit ${code}): ${stderr.trim()}`
                : `Claude Code ping/pong preflight failed (exit ${code})`,
            ),
          );
        });
      });
    },
  });
}

export interface ClaudeCodeRuntimeResolution {
  claudePath: string;
  cwd?: string;
}

export async function runClaudeCodeBridgeStartupProbe(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: BridgeConfig | PreparedBridgeConfig,
  options?: { strictConfig: boolean },
): Promise<ClaudeCodeRuntimeResolution> {
  const strictConfig = options?.strictConfig === true;
  const claudePath =
    strictConfig && bridgeConfig
      ? getStrictClaudeCodePath(bridgeConfig as PreparedClaudeBridgeConfig)
      : resolveClaudeCodePath(env, bridgeConfig);
  const cwd =
    strictConfig && bridgeConfig
      ? getStrictClaudeBridgeCwd(bridgeConfig as PreparedClaudeBridgeConfig)
      : getAutoDetectClaudeBridgeCwd(env, bridgeConfig);
  await runClaudeCodePreflight(claudePath, env);
  await runClaudeCodeWritePongProbe(claudePath, env, bridgeConfig, { strictConfig });
  return { claudePath, cwd };
}

const SESSION_BRIEFING_MAX_TURNS = 3;

export async function createClaudeCodeBridgeRunner(
  config: BridgeRunnerConfig,
  abortSignal?: AbortSignal,
): Promise<BridgeRunner> {
  const { slug, sendMessage, debugLog, sessionBriefing } = config;
  const prepared = config.bridgeConfig;
  if (prepared.mode !== "claude-code") {
    throw new Error("Claude Code runtime is not prepared.");
  }
  const claudePath = prepared.claudeCodePath;
  const cwd = prepared.bridgeCwd;
  const preparedClaudePath = claudePath;
  const attachmentRoot = prepared.attachmentDir;
  const attachmentMaxBytes = prepared.attachmentMaxBytes;
  const activeStreams = new Map<string, ActiveStream>();

  ensureDirectoryWritable(attachmentRoot);

  await runClaudeCodePreflight(claudePath, process.env);

  let sessionId: string | null = null;
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = abortSignal?.aborted ?? false;
  let activeChild: import("node:child_process").ChildProcess | null = null;

  if (abortSignal) {
    abortSignal.addEventListener(
      "abort",
      () => {
        stopped = true;
        if (activeChild) {
          activeChild.kill("SIGINT");
        }
      },
      { once: true },
    );
  }

  const canvasReminderEvery = prepared.canvasReminderEvery;

  async function deliverToClaudeCode(prompt: string, opts?: { maxTurns?: number }): Promise<void> {
    if (stopped) return;
    const args = buildClaudeArgs(
      prompt,
      sessionId,
      config.instructions.systemPrompt,
      process.env,
      opts,
      prepared,
    );
    debugLog(`spawning claude: ${args.join(" ").slice(0, 200)}...`);

    const spawnEnv = { ...process.env };
    delete spawnEnv.CLAUDECODE;
    const child = spawn(preparedClaudePath, args, {
      cwd,
      env: spawnEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChild = child;

    const stderrChunks: string[] = [];
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    const rl = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
    let capturedSessionId: string | null = null;

    for await (const line of rl) {
      if (stopped) break;
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      let event: { type?: string; [key: string]: unknown };
      try {
        event = JSON.parse(trimmed) as { type?: string; [key: string]: unknown };
      } catch {
        debugLog(`ignoring non-JSON claude stream line: ${trimmed.slice(0, 120)}`);
        continue;
      }

      if (event.type === "result") {
        const result = event as { session_id?: string };
        if (typeof result.session_id === "string" && result.session_id.length > 0) {
          capturedSessionId = result.session_id;
        }
      } else if (event.type === "assistant") {
        const text = typeof event.message === "string" ? event.message : "";
        debugLog(`claude assistant: ${text.slice(0, 200)}`);
      } else if (event.type === "tool_use") {
        const name = typeof event.name === "string" ? event.name : "unknown";
        debugLog(`claude tool_use: ${name}`);
      } else if (event.type === "tool_result") {
        const isError = event.is_error === true;
        if (isError) {
          const content = typeof event.content === "string" ? event.content : "";
          debugLog(`claude tool_result error: ${content.slice(0, 200)}`);
        }
      }
    }

    const exitCode = await new Promise<number | null>((resolve) => {
      if (child.exitCode !== null) {
        resolve(child.exitCode);
        return;
      }
      child.on("close", (code) => resolve(code));
    });

    activeChild = null;

    if (capturedSessionId) {
      sessionId = capturedSessionId;
      debugLog(`captured session_id: ${sessionId}`);
    }

    if (exitCode !== null && exitCode !== 0 && !stopped) {
      const detail = stderrChunks.join("").trim() || `exit code ${exitCode}`;
      throw new Error(`Claude Code exited with error: ${detail}`);
    }
  }
  await deliverToClaudeCode(sessionBriefing, { maxTurns: SESSION_BRIEFING_MAX_TURNS });
  debugLog("session briefing delivered");

  const queue = createBridgeEntryQueue({
    onEntry: async (entry: BufferedEntry) => {
      const chat = readTextChatMessage(entry);
      if (chat) {
        const includeCanvasReminder = shouldIncludeCanvasPolicyReminder(
          forwardedMessageCount + 1,
          canvasReminderEvery,
        );
        const prompt = buildInboundPrompt(slug, chat, includeCanvasReminder, config.instructions);
        await deliverToClaudeCode(prompt);
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
        const prompt = buildRenderErrorPrompt(slug, renderError, config.instructions);
        await deliverToClaudeCode(prompt);
        forwardedMessageCount += 1;
        config.onDeliveryUpdate?.({
          channel: entry.channel,
          messageId: entry.msg.id,
          stage: "confirmed",
        });
        return;
      }

      if (!MONITORED_ATTACHMENT_CHANNELS.has(entry.channel)) return;
      const includeCanvasReminder = shouldIncludeCanvasPolicyReminder(
        forwardedMessageCount + 1,
        canvasReminderEvery,
      );
      const deliveredAttachment = await handleAttachmentEntry({
        activeStreams,
        attachmentMaxBytes,
        attachmentRoot,
        deliverPrompt: async (prompt) => {
          await deliverToClaudeCode(prompt);
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
      void sendMessage(CHANNELS.CHAT, {
        id: generateMessageId(),
        type: "text",
        data: `Bridge error: ${message}`,
      });
    },
  });
  debugLog(`claude-code bridge runner started (path=${claudePath})`);

  return {
    enqueue: (entries) => queue.enqueue(entries),

    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      if (activeChild) {
        activeChild.kill("SIGINT");
      }
      await queue.stop();
    },

    status(): BridgeStatus {
      return {
        running: !stopped,
        sessionId: sessionId ?? undefined,
        lastError,
        forwardedMessages: forwardedMessageCount,
      };
    },
  };
}
