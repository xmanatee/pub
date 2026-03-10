import { PubApiClient } from "../api.js";
import { errorMessage } from "../cli-error.js";
import type { BridgeConfig, Config } from "../config.js";
import { getConfig } from "../config.js";
import type { BridgeMode } from "../live-daemon-shared.js";
import {
  type BridgeAvailability,
  type BridgeSelection,
  buildBridgeProcessEnv,
  detectBridgeAvailability,
  resolveBridgeSelection,
  runBridgeStartupPreflight,
} from "./bridge-runtime.js";
import { formatApiError } from "./command-utils.js";
import { stopOtherDaemons } from "./daemon-process.js";

export interface StartPreflightResult {
  runtimeConfig: Config;
  bridgeMode: BridgeMode;
  bridgeProcessEnv: NodeJS.ProcessEnv;
  bridgeSelection: BridgeSelection;
  passedChecks: string[];
}

interface CheckOutcome {
  label: string;
  detail: string;
}

const BRIDGE_CONFIG_FIELDS: Array<{ field: keyof BridgeConfig; label: string }> = [
  { field: "mode", label: "bridge.mode" },
  { field: "openclawPath", label: "openclaw.path" },
  { field: "openclawStateDir", label: "openclaw.stateDir" },
  { field: "openclawWorkspace", label: "openclaw.workspace" },
  { field: "sessionId", label: "openclaw.sessionId" },
  { field: "threadId", label: "openclaw.threadId" },
  { field: "canvasReminderEvery", label: "openclaw.canvasReminderEvery" },
  { field: "deliver", label: "openclaw.deliver" },
  { field: "deliverChannel", label: "openclaw.deliverChannel" },
  { field: "replyTo", label: "openclaw.replyTo" },
  { field: "deliverTimeoutMs", label: "openclaw.deliverTimeoutMs" },
  { field: "attachmentDir", label: "openclaw.attachmentDir" },
  { field: "attachmentMaxBytes", label: "openclaw.attachmentMaxBytes" },
  { field: "claudeCodePath", label: "claude-code.path" },
  { field: "claudeCodeModel", label: "claude-code.model" },
  { field: "claudeCodeAllowedTools", label: "claude-code.allowedTools" },
  { field: "claudeCodeAppendSystemPrompt", label: "claude-code.appendSystemPrompt" },
  { field: "claudeCodeMaxTurns", label: "claude-code.maxTurns" },
  { field: "claudeCodeCwd", label: "claude-code.cwd" },
  { field: "commandDefaultTimeoutMs", label: "command.defaultTimeoutMs" },
  { field: "commandMaxOutputBytes", label: "command.maxOutputBytes" },
  { field: "commandMaxConcurrent", label: "command.maxConcurrent" },
];

const BRIDGE_ENV_OVERRIDE_KEYS = [
  "OPENCLAW_PATH",
  "OPENCLAW_STATE_DIR",
  "OPENCLAW_WORKSPACE",
  "OPENCLAW_SESSION_ID",
  "OPENCLAW_THREAD_ID",
  "OPENCLAW_CANVAS_REMINDER_EVERY",
  "OPENCLAW_DELIVER",
  "OPENCLAW_DELIVER_CHANNEL",
  "OPENCLAW_REPLY_TO",
  "OPENCLAW_DELIVER_TIMEOUT_MS",
  "OPENCLAW_ATTACHMENT_DIR",
  "OPENCLAW_ATTACHMENT_MAX_BYTES",
  "CLAUDE_CODE_PATH",
  "CLAUDE_CODE_MODEL",
  "CLAUDE_CODE_ALLOWED_TOOLS",
  "CLAUDE_CODE_APPEND_SYSTEM_PROMPT",
  "CLAUDE_CODE_MAX_TURNS",
  "CLAUDE_CODE_CWD",
  "PUB_COMMAND_DEFAULT_TIMEOUT_MS",
  "PUB_COMMAND_MAX_OUTPUT_BYTES",
  "PUB_COMMAND_MAX_CONCURRENT",
] as const;

function listSavedBridgeConfigKeys(bridgeConfig?: BridgeConfig): string[] {
  if (!bridgeConfig) return [];
  return BRIDGE_CONFIG_FIELDS.filter(({ field }) => bridgeConfig[field] !== undefined).map(
    ({ label }) => label,
  );
}

function listBridgeEnvOverrides(env: NodeJS.ProcessEnv = process.env): string[] {
  return BRIDGE_ENV_OVERRIDE_KEYS.filter((key) => {
    const value = env[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function formatBridgeAvailability(entries: BridgeAvailability[]): string {
  return entries
    .map(
      (entry) => `${entry.mode}=${entry.available ? "available" : "unavailable"} (${entry.detail})`,
    )
    .join(" | ");
}

function formatPreflightError(params: {
  failures: CheckOutcome[];
  passed: CheckOutcome[];
  skipped: CheckOutcome[];
}): string {
  const { failures, passed, skipped } = params;
  const lines: string[] = [
    "Start preflight failed. Critical checks did not pass:",
    ...failures.map((entry) => `- [${entry.label}] ${entry.detail}`),
  ];

  if (passed.length > 0) {
    lines.push("", "Passed checks:");
    lines.push(...passed.map((entry) => `- [${entry.label}] ${entry.detail}`));
  }

  if (skipped.length > 0) {
    lines.push("", "Skipped checks:");
    lines.push(...skipped.map((entry) => `- [${entry.label}] ${entry.detail}`));
  }

  lines.push("", "Debug tips:");
  lines.push("- Run `pub config` to inspect saved CLI configuration.");
  lines.push("- Run `pub config --auto` to detect and save a working bridge.");
  lines.push(
    "- Use `pub start --bridge openclaw|claude-code|claude-sdk` to force a bridge mode.",
  );

  return lines.join("\n");
}

export async function runStartPreflight(opts: { bridge?: string }): Promise<StartPreflightResult> {
  const passed: CheckOutcome[] = [];
  const failures: CheckOutcome[] = [];
  const skipped: CheckOutcome[] = [];

  let runtimeConfig: Config | null = null;
  let bridgeSelection: BridgeSelection | null = null;
  let bridgeProcessEnv: NodeJS.ProcessEnv = buildBridgeProcessEnv();

  passed.push({ label: "webrtc", detail: "werift (pure TypeScript)" });

  try {
    runtimeConfig = getConfig();
    const source = process.env.PUB_API_KEY?.trim() ? "env" : "saved config";
    passed.push({ label: "config", detail: `API key configured (${source})` });
    bridgeProcessEnv = buildBridgeProcessEnv(runtimeConfig.bridge);
    const savedBridgeConfig = listSavedBridgeConfigKeys(runtimeConfig.bridge);
    const envOverrides = listBridgeEnvOverrides();
    passed.push({
      label: "bridge.config",
      detail: `saved: ${savedBridgeConfig.join(", ") || "(none)"} | env overrides: ${envOverrides.join(", ") || "(none)"}`,
    });
  } catch (error) {
    failures.push({ label: "config", detail: errorMessage(error) });
    bridgeProcessEnv = buildBridgeProcessEnv();
  }

  const bridgeAvailability = detectBridgeAvailability(bridgeProcessEnv);
  passed.push({
    label: "bridge.available",
    detail: formatBridgeAvailability(bridgeAvailability),
  });

  try {
    const savedMode = runtimeConfig?.bridge?.mode;
    if (opts.bridge) {
      bridgeSelection = resolveBridgeSelection(opts, bridgeProcessEnv);
    } else if (savedMode) {
      bridgeSelection = resolveBridgeSelection({ bridge: savedMode }, bridgeProcessEnv);
    } else {
      throw new Error(
        "No bridge configured. Run `pub config --auto` or pass --bridge openclaw|claude-code|claude-sdk.",
      );
    }
    passed.push({
      label: "bridge.resolve",
      detail: `${bridgeSelection.mode} (${bridgeSelection.source}, ${bridgeSelection.detail})`,
    });
  } catch (error) {
    failures.push({ label: "bridge.resolve", detail: errorMessage(error) });
  }

  if (bridgeSelection) {
    try {
      const details = await runBridgeStartupPreflight(bridgeSelection, bridgeProcessEnv);
      passed.push({ label: "bridge.preflight", detail: details.join(" | ") });
    } catch (error) {
      failures.push({ label: `bridge.${bridgeSelection.mode}`, detail: errorMessage(error) });
    }
  } else {
    skipped.push({
      label: "bridge.preflight",
      detail: "skipped because bridge mode could not be resolved",
    });
  }

  if (runtimeConfig) {
    const client = new PubApiClient(runtimeConfig.baseUrl, runtimeConfig.apiKey);
    try {
      await client.getLive();
      passed.push({
        label: "api",
        detail: `authenticated and reachable at ${runtimeConfig.baseUrl}`,
      });
    } catch (error) {
      failures.push({ label: "api", detail: formatApiError(error) });
    }
  } else {
    skipped.push({
      label: "api",
      detail: "skipped because configuration is unavailable",
    });
  }

  try {
    await stopOtherDaemons();
    passed.push({
      label: "daemon.cleanup",
      detail: "no stale daemon conflicts detected",
    });
  } catch (error) {
    failures.push({ label: "daemon.cleanup", detail: errorMessage(error) });
  }

  if (failures.length > 0) {
    throw new Error(formatPreflightError({ failures, passed, skipped }));
  }

  if (!runtimeConfig || !bridgeSelection) {
    throw new Error(
      "Start preflight failed: internal error while resolving runtime configuration.",
    );
  }

  return {
    runtimeConfig,
    bridgeMode: bridgeSelection.mode,
    bridgeProcessEnv,
    bridgeSelection,
    passedChecks: passed.map((entry) => `[${entry.label}] ${entry.detail}`),
  };
}
