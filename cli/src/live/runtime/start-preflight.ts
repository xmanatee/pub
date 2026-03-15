import { PubApiClient } from "../../core/api/client.js";
import type {
  ApiClientSettings,
  BridgeSettings,
  ResolvedPubSettings,
} from "../../core/config/index.js";
import {
  getApiClientSettings,
  listConfiguredKeys,
  resolvePubSettings,
} from "../../core/config/index.js";
import { errorMessage } from "../../core/errors/cli-error.js";
import type { BridgeMode } from "../bridge/providers/types.js";
import {
  buildBridgeProcessEnv,
  buildBridgeSettings,
  runBridgeStartupPreflight,
} from "./bridge-runtime.js";
import { formatApiError } from "./command-utils.js";
import { stopRecordedDaemons } from "./daemon-process.js";

interface StartPreflightResult {
  apiClientSettings: ApiClientSettings;
  bridgeSettings: BridgeSettings;
  bridgeProcessEnv: NodeJS.ProcessEnv;
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

  lines.push("", "Troubleshooting tips:");
  lines.push("- Run `pub config` to inspect saved CLI configuration.");
  lines.push("- Run `pub config --auto` to detect and save a working bridge.");
  lines.push("- Set `bridge.mode` in saved config before starting the daemon.");
  lines.push("- Enable verbose daemon logs with `pub config --set bridge.verbose=true`.");

  return lines.join("\n");
}

export async function runStartPreflight(): Promise<StartPreflightResult> {
  const passed: CheckOutcome[] = [];
  const failures: CheckOutcome[] = [];
  const skipped: CheckOutcome[] = [];

  let resolvedSettings: ResolvedPubSettings | null = null;
  let apiClientSettings: ApiClientSettings | null = null;
  let bridgeSettings: BridgeSettings | null = null;
  let bridgeMode: BridgeMode | null = null;
  const bridgeProcessEnv: NodeJS.ProcessEnv = buildBridgeProcessEnv();

  passed.push({ label: "webrtc", detail: "werift (pure TypeScript)" });

  try {
    resolvedSettings = resolvePubSettings();
    const savedBridgeKeys = listConfiguredKeys(resolvedSettings.rawConfig, "bridge");
    passed.push({
      label: "bridge.config",
      detail: `saved: ${savedBridgeKeys.join(", ") || "(none)"}`,
    });
  } catch (error) {
    failures.push({ label: "config", detail: errorMessage(error) });
  }

  try {
    const savedMode = resolvedSettings?.rawConfig.bridge?.mode ?? null;
    if (!savedMode) {
      throw new Error("No bridge configured. Run `pub config --auto` or set `bridge.mode`.");
    }
    bridgeMode = savedMode;
    passed.push({
      label: "bridge.mode",
      detail: `${savedMode} (loaded from config)`,
    });
  } catch (error) {
    failures.push({ label: "bridge.mode", detail: errorMessage(error) });
  }

  if (bridgeMode) {
    try {
      bridgeSettings = buildBridgeSettings(
        bridgeMode,
        resolvedSettings?.rawConfig.bridge ?? {},
        bridgeProcessEnv,
      );
      const probe = await runBridgeStartupPreflight(bridgeMode, bridgeProcessEnv, bridgeSettings);
      passed.push({ label: "bridge.preflight", detail: probe.detailLines.join(" | ") });
    } catch (error) {
      failures.push({ label: `bridge.${bridgeMode}`, detail: errorMessage(error) });
    }
  } else {
    skipped.push({
      label: "bridge.preflight",
      detail: "skipped because bridge mode could not be resolved",
    });
  }

  try {
    apiClientSettings = getApiClientSettings();
    const source = process.env.PUB_API_KEY?.trim() ? "env" : "saved config";
    passed.push({ label: "config", detail: `API key configured (${source})` });
  } catch (error) {
    failures.push({ label: "config", detail: errorMessage(error) });
  }

  if (apiClientSettings) {
    const client = new PubApiClient(apiClientSettings.baseUrl, apiClientSettings.apiKey);
    try {
      await client.getLive();
      passed.push({
        label: "api",
        detail: `authenticated and reachable at ${apiClientSettings.baseUrl}`,
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
    const stoppedCount = await stopRecordedDaemons();
    passed.push({
      label: "daemon.cleanup",
      detail:
        stoppedCount === 0
          ? "no recorded daemon conflicts detected"
          : `stopped ${stoppedCount} recorded daemon${stoppedCount === 1 ? "" : "s"}`,
    });
  } catch (error) {
    failures.push({ label: "daemon.cleanup", detail: errorMessage(error) });
  }

  if (failures.length > 0) {
    throw new Error(formatPreflightError({ failures, passed, skipped }));
  }

  if (!apiClientSettings || !bridgeMode || !bridgeSettings) {
    throw new Error("Start preflight failed: internal error while resolving runtime settings.");
  }

  return {
    apiClientSettings,
    bridgeSettings,
    bridgeProcessEnv,
    passedChecks: passed.map((entry) => `[${entry.label}] ${entry.detail}`),
  };
}
