import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type BridgeMessage, CHANNELS, generateMessageId } from "./bridge-protocol.js";
import { ipcCall } from "./tunnel-ipc.js";

const execFileAsync = promisify(execFile);
const OPENCLAW_DISCOVERY_PATHS = [
  "/app/dist/index.js",
  join(homedir(), "openclaw", "dist", "index.js"),
  join(homedir(), ".openclaw", "openclaw"),
  "/usr/local/bin/openclaw",
  "/opt/homebrew/bin/openclaw",
];

interface BridgeProcessInfo {
  pid: number;
  tunnelId: string;
  mode: "openclaw";
  sessionId?: string;
  startedAt: number;
  status: "starting" | "ready" | "waiting-daemon" | "error" | "stopped";
  lastError?: string;
  updatedAt: number;
}

interface StartBridgeParams {
  infoPath: string;
  socketPath: string;
  tunnelId: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readSessionIdFromOpenClaw(threadId?: string): string | null {
  try {
    const sessionsPath = join(
      homedir(),
      ".openclaw",
      "agents",
      "main",
      "sessions",
      "sessions.json",
    );
    const sessions = JSON.parse(readFileSync(sessionsPath, "utf-8")) as Record<string, unknown>;
    if (threadId && threadId.length > 0) {
      const byThread = sessions[`agent:main:main:thread:${threadId}`] as
        | { sessionId?: string }
        | undefined;
      if (typeof byThread?.sessionId === "string" && byThread.sessionId.length > 0) {
        return byThread.sessionId;
      }
    }
    const main = sessions["agent:main:main"] as { sessionId?: string } | undefined;
    if (typeof main?.sessionId === "string" && main.sessionId.length > 0) {
      return main.sessionId;
    }
    return null;
  } catch {
    return null;
  }
}

function resolveOpenClawPath(): string {
  const configuredPath = process.env.OPENCLAW_PATH;
  if (configuredPath) {
    if (!existsSync(configuredPath)) {
      throw new Error(`OPENCLAW_PATH does not exist: ${configuredPath}`);
    }
    return configuredPath;
  }

  try {
    const which = execFileSync("which", ["openclaw"], { timeout: 5_000 }).toString().trim();
    if (which.length > 0 && existsSync(which)) {
      return which;
    }
  } catch {
    // Fall through to explicit candidates.
  }

  for (const candidate of OPENCLAW_DISCOVERY_PATHS) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `OpenClaw executable was not found. Set OPENCLAW_PATH or install openclaw. Checked: ${OPENCLAW_DISCOVERY_PATHS.join(", ")}`,
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

function buildInboundPrompt(tunnelId: string, userText: string): string {
  return [
    `[Pubblue Tunnel ${tunnelId}] Incoming user message:`,
    "",
    userText,
    "",
    "---",
    `Reply with: pubblue tunnel write --tunnel ${tunnelId} "<your reply>"`,
    `Canvas update: pubblue tunnel write --tunnel ${tunnelId} -c canvas -f /path/to/file.html`,
  ].join("\n");
}

function readTextChatMessage(entry: unknown): { id: string; text: string } | null {
  if (!entry || typeof entry !== "object") return null;
  const outer = entry as { channel?: unknown; msg?: unknown };
  if (outer.channel !== CHANNELS.CHAT || !outer.msg || typeof outer.msg !== "object") return null;
  const msg = outer.msg as BridgeMessage;
  if (msg.type !== "text" || typeof msg.data !== "string" || typeof msg.id !== "string")
    return null;
  return { id: msg.id, text: msg.data };
}

function writeBridgeInfo(
  infoPath: string,
  patch: Omit<BridgeProcessInfo, "updatedAt"> & { updatedAt?: number },
): void {
  const payload: BridgeProcessInfo = {
    ...patch,
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  writeFileSync(infoPath, JSON.stringify(payload));
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
  tunnelId: string;
}): Promise<void> {
  const deliverText = buildInboundPrompt(params.tunnelId, params.text);
  const timeoutMs = Number.parseInt(process.env.OPENCLAW_DELIVER_TIMEOUT_MS || "120000", 10);
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120_000;

  const args = ["agent", "--local", "--session-id", params.sessionId, "-m", deliverText];

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
  try {
    await execFileAsync(invocation.cmd, invocation.args, {
      timeout: effectiveTimeoutMs,
    });
  } catch (error) {
    throw formatExecFailure("OpenClaw delivery failed", error);
  }
}

export async function startOpenClawBridge(params: StartBridgeParams): Promise<void> {
  const startedAt = Date.now();
  const baseInfo: Omit<BridgeProcessInfo, "status" | "updatedAt"> = {
    pid: process.pid,
    tunnelId: params.tunnelId,
    mode: "openclaw",
    startedAt,
  };

  let shuttingDown = false;
  const shutdown = () => {
    shuttingDown = true;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  writeBridgeInfo(params.infoPath, {
    ...baseInfo,
    status: "starting",
  });

  try {
    const openclawPath = resolveOpenClawPath();
    const sessionId =
      process.env.OPENCLAW_SESSION_ID ||
      readSessionIdFromOpenClaw(process.env.OPENCLAW_THREAD_ID) ||
      "";
    if (sessionId.length === 0) {
      throw new Error(
        "OpenClaw session could not be resolved. Set OPENCLAW_SESSION_ID or OPENCLAW_THREAD_ID.",
      );
    }

    await runOpenClawPreflight(openclawPath);

    try {
      const daemonStatus = await ipcCall(params.socketPath, { method: "status", params: {} });
      if (!daemonStatus.ok) {
        throw new Error(String(daemonStatus.error || "daemon status request failed"));
      }
    } catch (error) {
      throw new Error(
        `Failed to connect to local tunnel daemon socket (${params.socketPath}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    writeBridgeInfo(params.infoPath, {
      ...baseInfo,
      sessionId,
      status: "ready",
    });

    const seenIds = new Set<string>();
    let consecutiveReadFailures = 0;
    while (!shuttingDown) {
      let messages: unknown[] = [];
      try {
        const response = await ipcCall(params.socketPath, {
          method: "read",
          params: { channel: CHANNELS.CHAT },
        });
        if (!response.ok) {
          throw new Error(String(response.error || "daemon read failed"));
        }
        messages = Array.isArray(response.messages) ? response.messages : [];
        consecutiveReadFailures = 0;
      } catch (error) {
        consecutiveReadFailures += 1;
        writeBridgeInfo(params.infoPath, {
          ...baseInfo,
          sessionId,
          status: "waiting-daemon",
          lastError: error instanceof Error ? error.message : String(error),
        });
        const delayMs = Math.min(5_000, 500 * 2 ** Math.min(consecutiveReadFailures, 4));
        await sleep(delayMs);
        continue;
      }

      if (messages.length === 0) {
        await sleep(400);
        continue;
      }

      for (const entry of messages) {
        const chat = readTextChatMessage(entry);
        if (!chat || seenIds.has(chat.id)) continue;
        await deliverMessageToOpenClaw({
          openclawPath,
          sessionId,
          text: chat.text,
          tunnelId: params.tunnelId,
        });
        seenIds.add(chat.id);
      }

      writeBridgeInfo(params.infoPath, {
        ...baseInfo,
        sessionId,
        status: "ready",
      });
    }

    writeBridgeInfo(params.infoPath, {
      ...baseInfo,
      sessionId,
      status: "stopped",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeBridgeInfo(params.infoPath, {
      ...baseInfo,
      status: "error",
      lastError: message,
    });
    try {
      await ipcCall(params.socketPath, {
        method: "write",
        params: {
          channel: CHANNELS.CHAT,
          msg: {
            id: generateMessageId(),
            type: "text",
            data: `Bridge error: ${message}`,
          } satisfies BridgeMessage,
        },
      });
    } catch {
      // Daemon may be unavailable while bridge exits.
    }
    throw error;
  } finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  }
}
