#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const MIN_SUPPORTED_CLI = [0, 4, 8];
const MAX_SEEN_IDS = 1000;
const OPENCLAW_DISCOVERY_PATHS = [
  "/app/dist/index.js",
  join(homedir(), "openclaw", "dist", "index.js"),
  join(homedir(), ".openclaw", "openclaw"),
  "/usr/local/bin/openclaw",
  "/opt/homebrew/bin/openclaw",
];
const PUBBLUE_DISCOVERY_PATHS = [
  join(homedir(), ".openclaw", "bin", "pubblue"),
  "/home/node/.openclaw/bin/pubblue",
  "/usr/local/bin/pubblue",
];
const MODES = {
  OPENCLAW_DELIVER: "openclaw-deliver",
  GATEWAY_REPLY: "gateway-reply",
};
let resolvedBridgeStateDir;

function usage() {
  console.error(
    [
      "Usage:",
      "  node skills/pubblue/scripts/openclaw-tunnel-bridge.mjs --start [--expires 7d]",
      "  node skills/pubblue/scripts/openclaw-tunnel-bridge.mjs --tunnel <id>",
      "  node skills/pubblue/scripts/openclaw-tunnel-bridge.mjs  # auto-attach if exactly one active tunnel",
      "",
      "Bridge modes (OPENCLAW_BRIDGE_MODE):",
      "  openclaw-deliver (recommended on OpenClaw)",
      "  gateway-reply     (alternative; requires compatible /v1 endpoints)",
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
      "  - Requires pubblue >= 0.4.8",
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
    let settled = false;
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

    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve({ code: code ?? 1, stdout, stderr });
    };

    child.on("error", (error) => {
      stderr += error instanceof Error ? error.message : String(error);
      finish(1);
    });

    child.on("close", (code) => {
      finish(code ?? 1);
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

function resolvePubblueBin(configuredBin) {
  if (configuredBin) {
    if (configuredBin.includes("/")) {
      if (!existsSync(configuredBin)) {
        throw new Error(`PUBBLUE_BIN path does not exist: ${configuredBin}`);
      }
      return configuredBin;
    }

    try {
      const whichConfigured = execFileSync("which", [configuredBin], { timeout: 5000 })
        .toString()
        .trim();
      if (whichConfigured) return configuredBin;
    } catch {
      throw new Error(`PUBBLUE_BIN command was not found in PATH: ${configuredBin}`);
    }
  }

  try {
    const whichPubblue = execFileSync("which", ["pubblue"], { timeout: 5000 })
      .toString()
      .trim();
    if (whichPubblue) return "pubblue";
  } catch {
    // no-op
  }

  for (const candidate of PUBBLUE_DISCOVERY_PATHS) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    [
      "pubblue CLI was not found.",
      "Install pubblue or set PUBBLUE_BIN.",
      `Checked: ${PUBBLUE_DISCOVERY_PATHS.join(", ")}`,
    ].join(" "),
  );
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
  } catch (error) {
    throw new Error(
      `Failed to parse JSON from pubblue follow stream: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function parseTunnelIdsFromListOutput(stdout) {
  const ids = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^([a-z0-9]{8,32})\b/);
    if (match?.[1]) ids.push(match[1]);
  }
  return ids;
}

async function listActiveTunnelIds(pubblueBin) {
  const result = await runPubblue(pubblueBin, ["tunnel", "list"]);
  if (result.code !== 0) {
    const details = `${result.stderr}\n${result.stdout}`.trim();
    throw new Error(details || "Failed to list active tunnels");
  }
  return parseTunnelIdsFromListOutput(result.stdout);
}

function tryEnsureWritableDir(dirPath) {
  try {
    if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
    const probePath = join(dirPath, `.bridge-write-test-${process.pid}-${Date.now()}`);
    writeFileSync(probePath, "ok");
    unlinkSync(probePath);
    return true;
  } catch {
    return false;
  }
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function resolveBridgeStateDir() {
  if (resolvedBridgeStateDir !== undefined) return resolvedBridgeStateDir;

  const homePath = process.env.HOME || process.env.USERPROFILE || homedir();
  const configuredPubblueRoot = process.env.PUBBLUE_DIR;
  const configuredBridgeState = process.env.OPENCLAW_BRIDGE_STATE_DIR || process.env.PUBBLUE_BRIDGE_DIR;
  const xdgState = process.env.XDG_STATE_HOME;
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  const tmpPath = process.env.TMPDIR || tmpdir();
  const cwdPath = process.cwd();

  const candidates = unique([
    configuredBridgeState,
    configuredPubblueRoot ? join(configuredPubblueRoot, "tunnel-bridge") : "",
    xdgState ? join(xdgState, "pubblue", "tunnel-bridge") : "",
    xdgConfig ? join(xdgConfig, "pubblue", "tunnel-bridge") : "",
    homePath ? join(homePath, ".config", "pubblue", "tunnel-bridge") : "",
    join(tmpPath, "pubblue", "tunnel-bridge"),
    join(cwdPath, ".pubblue-tunnel-bridge"),
  ]);

  for (const candidate of candidates) {
    if (tryEnsureWritableDir(candidate)) {
      resolvedBridgeStateDir = candidate;
      return resolvedBridgeStateDir;
    }
  }

  resolvedBridgeStateDir = null;
  return resolvedBridgeStateDir;
}

function getStatePath(tunnelId) {
  const baseDir = resolveBridgeStateDir();
  if (!baseDir) return null;
  return join(baseDir, `${tunnelId}.state.json`);
}

function getPidLockPath(tunnelId) {
  const baseDir = resolveBridgeStateDir();
  if (!baseDir) return null;
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
  if (!lockPath) {
    return () => {};
  }
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
  if (!statePath) return [];
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
  if (!statePath) return;
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

function parseTimeoutMs(rawValue, fallbackMs) {
  const parsed = Number.parseInt(rawValue || `${fallbackMs}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function ensureOpenClawDeliverConfigured() {
  if (process.env.OPENCLAW_DELIVER_CMD) return;
  const openclawPath = resolveOpenClawPath();
  if (!openclawPath) {
    throw new Error(
      "OpenClaw deliver mode selected, but OpenClaw executable was not found. Set OPENCLAW_PATH or OPENCLAW_DELIVER_CMD.",
    );
  }
}

async function verifyGatewayReachable(params) {
  const { agentId, gatewayToken, gatewayUrl } = params;
  const timeoutMs = parseTimeoutMs(process.env.OPENCLAW_GATEWAY_TIMEOUT_MS, 30_000);
  const headers = {};
  if (gatewayToken) headers.Authorization = `Bearer ${gatewayToken}`;
  if (agentId) headers["x-openclaw-agent-id"] = agentId;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, 10_000));
  try {
    const response = await fetch(`${gatewayUrl}/v1/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gateway preflight failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const body = await response.text();
      throw new Error(
        [
          `Gateway preflight expected JSON from /v1/models, got "${contentType || "unknown"}".`,
          `Body starts with: ${body.slice(0, 120).replace(/\s+/g, " ")}`,
          "OPENCLAW_GATEWAY_URL likely points to Control UI or this gateway build has no OpenAI-compatible API. Use openclaw-deliver mode.",
        ].join(" "),
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error(
        `Gateway preflight could not parse JSON from /v1/models: ${
          parseError instanceof Error ? parseError.message : String(parseError)
        }`,
      );
    }

    if (!data || typeof data !== "object" || !Array.isArray(data.data)) {
      throw new Error(
        "Gateway preflight got unexpected /v1/models payload (missing data[]). Use openclaw-deliver mode.",
      );
    }

    const chatProbe = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({}),
    });
    if (chatProbe.status === 404 || chatProbe.status === 405) {
      const body = await chatProbe.text();
      throw new Error(
        `Gateway preflight failed: /v1/chat/completions is unavailable (${chatProbe.status}): ${body.slice(0, 200)}`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Gateway preflight timed out while calling /v1/models");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  const timeoutMs = parseTimeoutMs(process.env.OPENCLAW_GATEWAY_TIMEOUT_MS, 30_000);
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
      timeout: parseTimeoutMs(process.env.OPENCLAW_DELIVER_TIMEOUT_MS, 120_000),
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
  const resolvedSession = process.env.OPENCLAW_SESSION_ID || resolveSessionId(threadId);
  if (!resolvedSession) {
    throw new Error(
      "OpenClaw session could not be resolved. Set OPENCLAW_SESSION_ID or OPENCLAW_THREAD_ID.",
    );
  }
  const args = [
    ...baseArgs,
    "agent",
    "--local",
    "--session-id",
    resolvedSession,
    "-m",
    deliverText,
  ];

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

  execFileSync(execBin, args, {
    stdio: "inherit",
    timeout: parseTimeoutMs(process.env.OPENCLAW_DELIVER_TIMEOUT_MS, 120_000),
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const pubblueBin = resolvePubblueBin(process.env.PUBBLUE_BIN || "");
  const mode = getMode();
  const gatewayUrl = (process.env.OPENCLAW_GATEWAY_URL || "http://127.0.0.1:18789").replace(
    /\/$/,
    "",
  );
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || "";
  const model = process.env.OPENCLAW_MODEL || "openclaw:main";
  const agentId = process.env.OPENCLAW_AGENT_ID || "";

  if (!args.start && !args.tunnelId) {
    let active;
    try {
      active = await listActiveTunnelIds(pubblueBin);
    } catch (error) {
      console.error(
        `Failed to auto-detect active tunnel: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      process.exit(1);
    }
    if (active.length === 1) {
      args.tunnelId = active[0];
      console.error(
        `No --start/--tunnel provided. Attaching to active tunnel ${args.tunnelId}.`,
      );
    } else {
      usage();
      process.exit(1);
    }
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

  try {
    if (mode === MODES.OPENCLAW_DELIVER) {
      ensureOpenClawDeliverConfigured();
      console.error("Bridge preflight: OpenClaw deliver mode is configured.");
    } else {
      await verifyGatewayReachable({ agentId, gatewayToken, gatewayUrl });
      console.error(`Bridge preflight: Gateway reachable at ${gatewayUrl}.`);
    }
  } catch (error) {
    console.error(
      `Bridge preflight failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  let tunnelId = args.tunnelId;
  let tunnelUrl = null;
  if (args.start) {
    const started = await runPubblue(pubblueBin, ["tunnel", "start", "--expires", args.expires]);
    if (started.code !== 0) {
      const output = `${started.stderr}\n${started.stdout}`.trim();
      console.error(output || "Failed to start tunnel");
      process.exit(1);
    }
    if (started.code === 0) {
      const info = extractTunnelInfo(started.stdout);
      tunnelId = info.tunnelId;
      tunnelUrl = info.tunnelUrl;
      if (!tunnelId) {
        console.error(`Could not parse tunnel id from output:\n${started.stdout}`);
        process.exit(1);
      }
    }
  }

  const sessionKey = process.env.OPENCLAW_SESSION_KEY || `pubblue:tunnel:${tunnelId}`;
  const bridgeStateDir = resolveBridgeStateDir();
  if (bridgeStateDir) {
    console.error(`Bridge state dir: ${bridgeStateDir}`);
  } else {
    console.error(
      "[bridge] No writable bridge state directory. Set OPENCLAW_BRIDGE_STATE_DIR or PUBBLUE_DIR.",
    );
    process.exit(1);
  }
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
          try {
            await sendTunnelMessage(
              `Bridge error: ${message}\n` +
                "Check bridge mode/env, OpenClaw session routing, or gateway auth/session config.",
            );
          } catch (sendError) {
            console.error(
              `Failed to report bridge error to tunnel: ${
                sendError instanceof Error ? sendError.message : String(sendError)
              }`,
            );
          }
        });
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.error(`[pubblue] ${text}`);
    });

    const exitCode = await new Promise((resolve) => {
      child.on("close", (code) => resolve(code ?? 1));
    });

    await processing;
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
