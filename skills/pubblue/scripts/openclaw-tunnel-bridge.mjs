#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const MIN_SUPPORTED_CLI = [0, 4, 4];
const MAX_SEEN_IDS = 1000;
const OPENCLAW_DISCOVERY_PATHS = [
  join(homedir(), "openclaw", "dist", "index.js"),
  join(homedir(), ".openclaw", "openclaw"),
  "/usr/local/bin/openclaw",
  "/opt/homebrew/bin/openclaw",
];
const MODES = {
  OPENCLAW_DELIVER: "openclaw-deliver",
  GATEWAY_REPLY: "gateway-reply",
};

function usage() {
  console.error(
    [
      "Usage:",
      "  node skills/pubblue/scripts/openclaw-tunnel-bridge.mjs --start [--expires 7d]",
      "  node skills/pubblue/scripts/openclaw-tunnel-bridge.mjs --tunnel <id>",
      "",
      "Bridge modes (OPENCLAW_BRIDGE_MODE):",
      "  openclaw-deliver (recommended on OpenClaw)",
      "  gateway-reply     (fallback)",
      "",
      "Core env:",
      "  OPENCLAW_BRIDGE_MODE   (optional; auto-detected if omitted)",
      "  OPENCLAW_SESSION_KEY   (gateway mode only, default: pubblue:tunnel:<id>)",
      "  PUBBLUE_BIN            (default: pubblue)",
      "",
      "OpenClaw deliver mode env:",
      "  OPENCLAW_DELIVER_CMD    (optional custom command receiving AGENT_MSG env)",
      "  OPENCLAW_PATH           (optional explicit openclaw binary/index.js path)",
      "  OPENCLAW_SESSION_ID     (optional explicit OpenClaw session UUID)",
      "  OPENCLAW_THREAD_ID      (optional; resolves session from sessions.json)",
      "  OPENCLAW_DELIVER_CHANNEL (optional, e.g. telegram)",
      "  OPENCLAW_REPLY_TO       (optional, for channel routing)",
      "  OPENCLAW_DELIVER_TIMEOUT_MS (default: 120000)",
      "",
      "Gateway reply mode env:",
      "  OPENCLAW_GATEWAY_URL    (default: http://127.0.0.1:18789)",
      "  OPENCLAW_GATEWAY_TOKEN  (optional token/password auth)",
      "  OPENCLAW_MODEL          (default: openclaw:main)",
      "  OPENCLAW_AGENT_ID       (optional x-openclaw-agent-id header)",
      "  OPENCLAW_GATEWAY_TIMEOUT_MS (default: 30000)",
      "",
      "Notes:",
      "  - Requires pubblue >= 0.4.4",
      "  - Maintains one long-lived pubblue read --follow consumer",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = { start: false, tunnelId: null, expires: "7d" };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--start") {
      args.start = true;
      continue;
    }
    if (token === "--tunnel") {
      args.tunnelId = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (token === "--expires") {
      args.expires = argv[i + 1] ?? args.expires;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
    console.error(`Unknown argument: ${token}`);
    usage();
    process.exit(1);
  }
  return args;
}

function normalizeVersion(versionText) {
  const match = versionText.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10),
  ];
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runPubblue(bin, args, stdinText) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });

    if (typeof stdinText === "string") child.stdin.write(stdinText);
    child.stdin.end();
  });
}

function extractTunnelInfo(stdout) {
  const idMatch = stdout.match(/Tunnel ID:\s*([a-z0-9]+)/i);
  const urlMatch = stdout.match(/Tunnel started:\s*(https?:\/\/\S+)/i);
  return {
    tunnelId: idMatch?.[1] ?? null,
    tunnelUrl: urlMatch?.[1] ?? null,
  };
}

function extractContentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof part.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function resolveOpenClawPath() {
  if (process.env.OPENCLAW_PATH && existsSync(process.env.OPENCLAW_PATH)) {
    return process.env.OPENCLAW_PATH;
  }

  try {
    const which = execFileSync("which", ["openclaw"], { timeout: 5000 })
      .toString()
      .trim();
    if (which && existsSync(which)) return which;
  } catch {
    // no-op
  }

  for (const candidate of OPENCLAW_DISCOVERY_PATHS) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveSessionId(threadId) {
  try {
    const sessionsPath = join(
      homedir(),
      ".openclaw",
      "agents",
      "main",
      "sessions",
      "sessions.json",
    );
    const sessions = JSON.parse(readFileSync(sessionsPath, "utf8"));
    if (threadId) {
      return sessions[`agent:main:main:thread:${threadId}`]?.sessionId || null;
    }
    return sessions["agent:main:main"]?.sessionId || null;
  } catch {
    return null;
  }
}

function parseFollowLine(line) {
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function getStatePath(tunnelId) {
  const baseDir = join(homedir(), ".config", "pubblue", "tunnel-bridge");
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
  return join(baseDir, `${tunnelId}.state.json`);
}

function getPidLockPath(tunnelId) {
  const baseDir = join(homedir(), ".config", "pubblue", "tunnel-bridge");
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
  return join(baseDir, `${tunnelId}.pid`);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquirePidLock(tunnelId) {
  const lockPath = getPidLockPath(tunnelId);
  if (existsSync(lockPath)) {
    let existingPid = null;
    try {
      existingPid = Number.parseInt(readFileSync(lockPath, "utf8").trim(), 10);
    } catch {
      existingPid = null;
    }
    if (Number.isFinite(existingPid) && isProcessAlive(existingPid)) {
      throw new Error(
        `Bridge already running for tunnel ${tunnelId} (pid ${existingPid}). Stop it first.`,
      );
    }
  }

  writeFileSync(lockPath, `${process.pid}`);
  return () => {
    try {
      unlinkSync(lockPath);
    } catch {
      // ignore cleanup failures
    }
  };
}

function loadSeenState(tunnelId) {
  const statePath = getStatePath(tunnelId);
  if (!existsSync(statePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    if (!Array.isArray(parsed.seenIds)) return [];
    return parsed.seenIds.filter((value) => typeof value === "string");
  } catch {
    return [];
  }
}

function saveSeenState(tunnelId, seenIds) {
  const statePath = getStatePath(tunnelId);
  const payload = { seenIds: seenIds.slice(-MAX_SEEN_IDS), updatedAt: Date.now() };
  writeFileSync(statePath, JSON.stringify(payload));
}

function getMode() {
  const requested = process.env.OPENCLAW_BRIDGE_MODE?.trim();
  if (requested) {
    if (requested === MODES.OPENCLAW_DELIVER || requested === MODES.GATEWAY_REPLY) {
      return requested;
    }
    throw new Error(
      `Invalid OPENCLAW_BRIDGE_MODE="${requested}". Use "${MODES.OPENCLAW_DELIVER}" or "${MODES.GATEWAY_REPLY}".`,
    );
  }

  if (process.env.OPENCLAW_DELIVER_CMD) return MODES.OPENCLAW_DELIVER;
  if (resolveOpenClawPath()) return MODES.OPENCLAW_DELIVER;
  return MODES.GATEWAY_REPLY;
}

function buildTunnelInboundPrompt(tunnelId, userText) {
  return [
    `[Pubblue Tunnel ${tunnelId}] Incoming user message:`,
    "",
    userText,
    "",
    "---",
    `To reply in this tunnel use: pubblue tunnel write --tunnel ${tunnelId} "<your reply>"`,
    `To update canvas use: pubblue tunnel write --tunnel ${tunnelId} -c canvas -f /path/to/file.html`,
  ].join("\n");
}

async function dispatchGatewayReply(params) {
  const {
    agentId,
    gatewayToken,
    gatewayUrl,
    model,
    sendTunnelMessage,
    sessionKey,
    text,
  } = params;
  const requestedTimeoutMs = Number.parseInt(
    process.env.OPENCLAW_GATEWAY_TIMEOUT_MS || "30000",
    10,
  );
  const timeoutMs =
    Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0 ? requestedTimeoutMs : 30000;
  const headers = {
    "Content-Type": "application/json",
  };
  if (gatewayToken) headers.Authorization = `Bearer ${gatewayToken}`;
  if (agentId) headers["x-openclaw-agent-id"] = agentId;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        user: sessionKey,
        messages: [{ role: "user", content: text }],
        stream: false,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Gateway request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gateway HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const content = extractContentText(choice?.message?.content) || "(No response content)";
  await sendTunnelMessage(content);
}

function dispatchOpenClawDeliver(params) {
  const { text, tunnelId } = params;
  const deliverText = buildTunnelInboundPrompt(tunnelId, text);

  if (process.env.OPENCLAW_DELIVER_CMD) {
    execFileSync(process.env.OPENCLAW_DELIVER_CMD, [], {
      stdio: "inherit",
      env: {
        ...process.env,
        AGENT_MSG: deliverText,
        AGENT_TUNNEL_ID: tunnelId,
      },
      timeout: Number.parseInt(process.env.OPENCLAW_DELIVER_TIMEOUT_MS || "120000", 10),
    });
    return;
  }

  const openclawPath = resolveOpenClawPath();
  if (!openclawPath) {
    throw new Error("OpenClaw executable not found (set OPENCLAW_PATH or OPENCLAW_DELIVER_CMD).");
  }

  const isIndexJs = openclawPath.endsWith(".js");
  const execBin = isIndexJs ? process.execPath : openclawPath;
  const baseArgs = isIndexJs ? [openclawPath] : [];

  const threadId = process.env.OPENCLAW_THREAD_ID;
  const resolvedSession =
    process.env.OPENCLAW_SESSION_ID || resolveSessionId(threadId) || "pubblue-tunnel-inbox";
  const args = [
    ...baseArgs,
    "agent",
    "--local",
    "--session-id",
    resolvedSession,
    "-m",
    deliverText,
    "--deliver",
  ];

  if (process.env.OPENCLAW_DELIVER_CHANNEL) {
    args.push("--channel", process.env.OPENCLAW_DELIVER_CHANNEL);
  }
  if (process.env.OPENCLAW_REPLY_TO) {
    args.push("--reply-to", process.env.OPENCLAW_REPLY_TO);
  }

  execFileSync(execBin, args, {
    stdio: "inherit",
    timeout: Number.parseInt(process.env.OPENCLAW_DELIVER_TIMEOUT_MS || "120000", 10),
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const pubblueBin = process.env.PUBBLUE_BIN || "pubblue";
  const mode = getMode();
  const gatewayUrl = (process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789").replace(
    /\/$/,
    "",
  );
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || "";
  const model = process.env.OPENCLAW_MODEL || "openclaw:main";
  const agentId = process.env.OPENCLAW_AGENT_ID || "";

  if (!args.start && !args.tunnelId) {
    usage();
    process.exit(1);
  }

  const versionCheck = await runPubblue(pubblueBin, ["--version"]);
  if (versionCheck.code !== 0) {
    console.error(versionCheck.stderr || "Failed to run pubblue --version");
    process.exit(1);
  }

  const cliVersion = normalizeVersion(versionCheck.stdout);
  if (!cliVersion || compareSemver(cliVersion, MIN_SUPPORTED_CLI) < 0) {
    console.error(
      `pubblue ${versionCheck.stdout.trim()} is unsupported. Need >= ${MIN_SUPPORTED_CLI.join(".")}.`,
    );
    process.exit(1);
  }

  let tunnelId = args.tunnelId;
  let tunnelUrl = null;
  if (args.start) {
    const started = await runPubblue(pubblueBin, ["tunnel", "start", "--expires", args.expires]);
    if (started.code !== 0) {
      console.error(started.stderr || started.stdout || "Failed to start tunnel");
      process.exit(1);
    }
    const info = extractTunnelInfo(started.stdout);
    tunnelId = info.tunnelId;
    tunnelUrl = info.tunnelUrl;
    if (!tunnelId) {
      console.error(`Could not parse tunnel id from output:\n${started.stdout}`);
      process.exit(1);
    }
  }

  const sessionKey = process.env.OPENCLAW_SESSION_KEY || `pubblue:tunnel:${tunnelId}`;
  const releasePidLock = acquirePidLock(tunnelId);
  const persistedSeen = loadSeenState(tunnelId);
  const seenIds = new Set(persistedSeen);
  const seenOrder = [...persistedSeen];

  const markSeen = (id) => {
    if (seenIds.has(id)) return;
    seenIds.add(id);
    seenOrder.push(id);
    if (seenOrder.length > MAX_SEEN_IDS) {
      const evicted = seenOrder.shift();
      if (evicted) seenIds.delete(evicted);
    }
    saveSeenState(tunnelId, seenOrder);
  };

  const sendTunnelMessage = async (text) => {
    const result = await runPubblue(
      pubblueBin,
      ["tunnel", "write", "--tunnel", tunnelId],
      `${text}\n`,
    );
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || "pubblue tunnel write failed");
    }
  };

  let processing = Promise.resolve();
  let shuttingDown = false;
  let followChild = null;

  const stop = () => {
    shuttingDown = true;
    if (followChild) followChild.kill("SIGTERM");
    releasePidLock();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.error(
    [
      "OpenClaw tunnel bridge started.",
      `Mode: ${mode}`,
      `Tunnel ID: ${tunnelId}`,
      tunnelUrl ? `Tunnel URL: ${tunnelUrl}` : "",
      mode === MODES.GATEWAY_REPLY ? `Gateway URL: ${gatewayUrl}` : "",
      mode === MODES.GATEWAY_REPLY ? `Model: ${model}` : "",
      mode === MODES.GATEWAY_REPLY ? `Session key: ${sessionKey}` : "",
      `Seen message ids loaded: ${persistedSeen.length}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  let restartDelayMs = 1000;
  while (!shuttingDown) {
    const child = spawn(pubblueBin, ["tunnel", "read", tunnelId, "--follow", "-c", "chat"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    followChild = child;
    const lines = createInterface({ input: child.stdout });

    lines.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      processing = processing
        .then(async () => {
          const incoming = parseFollowLine(trimmed);
          if (!incoming || incoming.channel !== "chat") return;

          const msg = incoming.msg;
          if (!msg || msg.type !== "text" || typeof msg.data !== "string") return;
          if (typeof msg.id !== "string" || msg.id.length === 0) return;
          if (seenIds.has(msg.id)) return;

          if (mode === MODES.OPENCLAW_DELIVER) {
            dispatchOpenClawDeliver({ text: msg.data, tunnelId });
            markSeen(msg.id);
            return;
          }

          await dispatchGatewayReply({
            agentId,
            gatewayToken,
            gatewayUrl,
            model,
            sendTunnelMessage,
            sessionKey,
            text: msg.data,
          });
          markSeen(msg.id);
        })
        .catch(async (error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Bridge pipeline error: ${message}`);
          await sendTunnelMessage(
            `Bridge error: ${message}\n` +
              "Check bridge mode/env, OpenClaw session routing, or gateway auth/session config.",
          ).catch(() => {});
        });
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.error(`[pubblue] ${text}`);
    });

    const exitCode = await new Promise((resolve) => {
      child.on("close", (code) => resolve(code ?? 1));
    });

    await processing.catch(() => {});
    lines.close();
    followChild = null;

    if (shuttingDown) break;
    console.error(
      `pubblue tunnel read exited (${exitCode}). Restarting in ${restartDelayMs}ms...`,
    );
    await sleep(restartDelayMs);
    restartDelayMs = Math.min(restartDelayMs * 2, 8000);
  }
  releasePidLock();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
