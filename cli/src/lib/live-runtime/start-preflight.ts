import { PubApiClient } from "../api.js";
import { errorMessage } from "../cli-error.js";
import type { Config } from "../config.js";
import { getConfig } from "../config.js";
import type { BridgeMode } from "../live-daemon-shared.js";
import {
  type BridgeSelection,
  buildBridgeProcessEnv,
  ensureNodeDatachannelAvailable,
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

  return lines.join("\n");
}

export async function runStartPreflight(opts: { bridge?: string }): Promise<StartPreflightResult> {
  const passed: CheckOutcome[] = [];
  const failures: CheckOutcome[] = [];
  const skipped: CheckOutcome[] = [];

  let runtimeConfig: Config | null = null;
  let bridgeSelection: BridgeSelection | null = null;
  let bridgeProcessEnv: NodeJS.ProcessEnv = buildBridgeProcessEnv();

  try {
    await ensureNodeDatachannelAvailable();
    passed.push({ label: "node-datachannel", detail: "native module loaded" });
  } catch (error) {
    failures.push({ label: "node-datachannel", detail: errorMessage(error) });
  }

  try {
    runtimeConfig = getConfig();
    const source = process.env.PUBBLUE_API_KEY?.trim() ? "PUBBLUE_API_KEY env" : "saved config";
    passed.push({ label: "config", detail: `API key configured (${source})` });
    bridgeProcessEnv = buildBridgeProcessEnv(runtimeConfig.bridge);
  } catch (error) {
    failures.push({ label: "config", detail: errorMessage(error) });
    bridgeProcessEnv = buildBridgeProcessEnv();
  }

  try {
    bridgeSelection = resolveBridgeSelection(opts, bridgeProcessEnv);
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
      await client.getPendingLive();
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
