import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  type BridgeMessage,
  CHANNELS,
  CONTROL_CHANNEL,
  generateMessageId,
} from "./bridge-protocol.js";
import { errorMessage } from "./cli-error.js";
import {
  type BridgeRunner,
  type BridgeRunnerConfig,
  type BridgeStatus,
  type BufferedEntry,
  buildInboundPrompt,
  buildSessionBriefing,
  MAX_SEEN_IDS,
  parseSessionContextMeta,
  readTextChatMessage,
  resolveCanvasReminderEvery,
  shouldIncludeCanvasPolicyReminder,
} from "./live-bridge-openclaw.js";

export function isClaudeCodeAvailable(): boolean {
  if (process.env.CLAUDE_CODE_PATH?.trim()) return true;
  try {
    const which = execFileSync("which", ["claude"], { timeout: 5_000 }).toString().trim();
    return which.length > 0;
  } catch {
    return false;
  }
}

export function resolveClaudeCodePath(): string {
  const configured = process.env.CLAUDE_CODE_PATH?.trim();
  if (configured) return configured;
  try {
    const which = execFileSync("which", ["claude"], { timeout: 5_000 }).toString().trim();
    if (which.length > 0) return which;
  } catch {}
  return "claude";
}

async function runClaudeCodePreflight(claudePath: string): Promise<void> {
  const env = { ...process.env };
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

export function buildClaudeArgs(
  prompt: string,
  sessionId: string | null,
  systemPrompt: string | null,
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

  const model = process.env.CLAUDE_CODE_MODEL?.trim();
  if (model) args.push("--model", model);

  const allowedTools = process.env.CLAUDE_CODE_ALLOWED_TOOLS?.trim();
  if (allowedTools) args.push("--allowedTools", allowedTools);

  const userSystemPrompt = process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT?.trim();
  const effectiveSystemPrompt = [systemPrompt, userSystemPrompt].filter(Boolean).join("\n\n");
  if (effectiveSystemPrompt) args.push("--append-system-prompt", effectiveSystemPrompt);

  const maxTurns = process.env.CLAUDE_CODE_MAX_TURNS?.trim();
  if (maxTurns) args.push("--max-turns", maxTurns);

  return args;
}

export async function createClaudeCodeBridgeRunner(
  config: BridgeRunnerConfig,
): Promise<BridgeRunner> {
  const { slug, sendMessage, debugLog } = config;

  const claudePath = resolveClaudeCodePath();
  const cwd = process.env.CLAUDE_CODE_CWD?.trim() || process.env.PUBBLUE_PROJECT_ROOT || undefined;

  await runClaudeCodePreflight(claudePath);

  const seenIds = new Set<string>();
  let sessionId: string | null = null;
  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopping = false;
  let activeChild: ReturnType<typeof spawn> | null = null;
  let sessionBriefingSent = false;
  let loopDone: Promise<void>;

  const queue: BufferedEntry[] = [];
  let notify: (() => void) | null = null;

  function enqueue(entries: Array<{ channel: string; msg: BridgeMessage }>): void {
    if (stopping) return;
    queue.push(...entries);
    notify?.();
    notify = null;
  }

  const canvasReminderEvery = resolveCanvasReminderEvery();

  async function deliverToClaudeCode(prompt: string): Promise<void> {
    const args = buildClaudeArgs(prompt, sessionId, config.instructions.systemPrompt);
    debugLog(`spawning claude: ${args.join(" ").slice(0, 200)}...`);

    const spawnEnv = { ...process.env };
    delete spawnEnv.CLAUDECODE;
    const child = spawn(claudePath, args, {
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
      if (stopping) break;
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      let event: { type?: string; [key: string]: unknown };
      try {
        event = JSON.parse(trimmed) as { type?: string; [key: string]: unknown };
      } catch {
        continue;
      }

      if (event.type === "result") {
        const result = event as { session_id?: string };
        if (typeof result.session_id === "string" && result.session_id.length > 0) {
          capturedSessionId = result.session_id;
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

    if (exitCode !== null && exitCode !== 0 && !stopping) {
      const detail = stderrChunks.join("").trim() || `exit code ${exitCode}`;
      throw new Error(`Claude Code exited with error: ${detail}`);
    }
  }

  async function processLoop(): Promise<void> {
    while (!stopping) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
        if (stopping) break;
      }

      const batch = queue.splice(0);
      for (const entry of batch) {
        if (stopping) break;
        const entryKey = `${entry.channel}:${entry.msg.id}`;
        if (seenIds.has(entryKey)) continue;
        seenIds.add(entryKey);
        if (seenIds.size > MAX_SEEN_IDS) seenIds.clear();

        try {
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
              await deliverToClaudeCode(briefing);
              debugLog("session briefing delivered");
            }
            continue;
          }

          const chat = readTextChatMessage(entry);
          if (chat) {
            const includeCanvasReminder = shouldIncludeCanvasPolicyReminder(
              forwardedMessageCount + 1,
              canvasReminderEvery,
            );
            const prompt = buildInboundPrompt(
              slug,
              chat,
              includeCanvasReminder,
              config.instructions,
            );
            await deliverToClaudeCode(prompt);
            forwardedMessageCount += 1;
          } else if (entry.msg.type === "binary" || entry.msg.type === "stream-start") {
            sendMessage(CHANNELS.CHAT, {
              id: generateMessageId(),
              type: "text",
              data: "Attachments are not supported in Claude Code bridge mode.",
            });
          }
        } catch (error) {
          const message = errorMessage(error);
          lastError = message;
          debugLog(`bridge entry processing failed: ${message}`, error);
          sendMessage(CHANNELS.CHAT, {
            id: generateMessageId(),
            type: "text",
            data: `Bridge error: ${message}`,
          });
        }
      }
    }
  }

  loopDone = processLoop();
  debugLog(`claude-code bridge runner started (path=${claudePath})`);

  return {
    enqueue,

    async stop(): Promise<void> {
      stopping = true;
      notify?.();
      notify = null;
      if (activeChild) {
        activeChild.kill("SIGINT");
      }
      await loopDone;
    },

    status(): BridgeStatus {
      return {
        running: !stopping,
        sessionId: sessionId ?? undefined,
        lastError,
        forwardedMessages: forwardedMessageCount,
      };
    },
  };
}
