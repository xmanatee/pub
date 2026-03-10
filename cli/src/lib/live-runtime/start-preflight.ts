import { PubApiClient } from "../api.js";
import { errorMessage } from "../cli-error.js";
import type {
  BridgeConfig,
  PreparedBridgeConfig,
  RequiredConfig,
  ResolvedConfig,
} from "../config.js";
import { getConfig, getRequiredConfig } from "../config.js";
import type { BridgeMode } from "../live-daemon-shared.js";
import {
  type BridgeSelection,
  buildBridgeProcessEnv,
  createBridgeSelection,
  parseBridgeMode,
  runBridgeStartupPreflight,
  validatePreparedBridgeConfig,
} from "./bridge-runtime.js";
import { formatApiError } from "./command-utils.js";
import { stopOtherDaemons } from "./daemon-process.js";

export interface StartPreflightResult {
  runtimeConfig: RequiredConfig;
  bridgeConfig: PreparedBridgeConfig;
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
  { field: "bridgeCwd", label: "bridge.cwd" },
  { field: "canvasReminderEvery", label: "bridge.canvasReminderEvery" },
  { field: "deliverTimeoutMs", label: "bridge.deliverTimeoutMs" },
  { field: "attachmentDir", label: "bridge.attachmentDir" },
  { field: "attachmentMaxBytes", label: "bridge.attachmentMaxBytes" },
  { field: "openclawPath", label: "openclaw.path" },
  { field: "openclawStateDir", label: "openclaw.stateDir" },
  { field: "sessionId", label: "openclaw.sessionId" },
  { field: "threadId", label: "openclaw.threadId" },
  { field: "deliver", label: "openclaw.deliver" },
  { field: "deliverChannel", label: "openclaw.deliverChannel" },
  { field: "claudeCodePath", label: "claude-code.path" },
  { field: "claudeCodeModel", label: "claude-code.model" },
  { field: "claudeCodeAllowedTools", label: "claude-code.allowedTools" },
  { field: "claudeCodeAppendSystemPrompt", label: "claude-code.appendSystemPrompt" },
  { field: "claudeCodeMaxTurns", label: "claude-code.maxTurns" },
  { field: "commandDefaultTimeoutMs", label: "command.defaultTimeoutMs" },
  { field: "commandMaxOutputBytes", label: "command.maxOutputBytes" },
  { field: "commandMaxConcurrent", label: "command.maxConcurrent" },
];

function listSavedBridgeConfigKeys(bridgeConfig?: BridgeConfig): string[] {
  if (!bridgeConfig) return [];
  return BRIDGE_CONFIG_FIELDS.filter(({ field }) => bridgeConfig[field] !== undefined).map(
    ({ label }) => label,
  );
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

  let resolvedConfig: ResolvedConfig | null = null;
  let runtimeConfig: RequiredConfig | null = null;
  let preparedBridgeConfig: PreparedBridgeConfig | null = null;
  let bridgeSelection: BridgeSelection | null = null;
  let bridgeProcessEnv: NodeJS.ProcessEnv = buildBridgeProcessEnv();

  passed.push({ label: "webrtc", detail: "werift (pure TypeScript)" });

  try {
    resolvedConfig = getConfig();
    bridgeProcessEnv = buildBridgeProcessEnv();
    const savedBridgeConfig = listSavedBridgeConfigKeys(resolvedConfig.bridge);
    passed.push({
      label: "bridge.config",
      detail: `saved: ${savedBridgeConfig.join(", ") || "(none)"}`,
    });
  } catch (error) {
    failures.push({ label: "config", detail: errorMessage(error) });
    bridgeProcessEnv = buildBridgeProcessEnv();
  }

  try {
    const savedMode = resolvedConfig?.bridge?.mode;
    if (!opts.bridge && !savedMode) {
      throw new Error(
        "No bridge configured. Run `pub config --auto` or pass --bridge openclaw|claude-code|claude-sdk.",
      );
    }
    const mode = opts.bridge ? parseBridgeMode(opts.bridge) : savedMode;
    if (!mode) {
      throw new Error("No bridge configured.");
    }
    bridgeSelection = createBridgeSelection(mode, opts.bridge ? "explicit" : "config");
    passed.push({
      label: "bridge.mode",
      detail: `${bridgeSelection.mode} (${bridgeSelection.detail})`,
    });
  } catch (error) {
    failures.push({ label: "bridge.mode", detail: errorMessage(error) });
  }

  if (bridgeSelection) {
    try {
      preparedBridgeConfig = validatePreparedBridgeConfig(
        bridgeSelection.mode,
        resolvedConfig?.bridge ?? {},
      );
      const probe = await runBridgeStartupPreflight(bridgeSelection, bridgeProcessEnv, preparedBridgeConfig);
      passed.push({ label: "bridge.preflight", detail: probe.detailLines.join(" | ") });
    } catch (error) {
      failures.push({ label: `bridge.${bridgeSelection.mode}`, detail: errorMessage(error) });
    }
  } else {
    skipped.push({
      label: "bridge.preflight",
      detail: "skipped because bridge mode could not be resolved",
    });
  }

  try {
    runtimeConfig = getRequiredConfig();
    const source = process.env.PUB_API_KEY?.trim() ? "env" : "saved config";
    passed.push({ label: "config", detail: `API key configured (${source})` });
  } catch (error) {
    failures.push({ label: "config", detail: errorMessage(error) });
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

  if (!runtimeConfig || !bridgeSelection || !preparedBridgeConfig) {
    throw new Error(
      "Start preflight failed: internal error while resolving runtime configuration.",
    );
  }

  return {
    runtimeConfig,
    bridgeConfig: preparedBridgeConfig,
    bridgeMode: bridgeSelection.mode,
    bridgeProcessEnv,
    bridgeSelection,
    passedChecks: passed.map((entry) => `[${entry.label}] ${entry.detail}`),
  };
}
