import {
  getResolvedSettingValue,
  listConfiguredKeys,
  readPubConfig,
  resolvePubSettings,
} from "../../core/config/index.js";
import type { StatusResponse } from "../../live/transport/ipc-protocol.js";

export function getLiveDebugEnableCommand(): string {
  return "pub config --set bridge.debug=true";
}

export function getConfiguredLiveDebugState(
  env: NodeJS.ProcessEnv = process.env,
): { enabled: boolean; source: string } | null {
  try {
    const resolved = resolvePubSettings(env);
    const debug = getResolvedSettingValue<boolean>(resolved, "bridge.debug");
    return {
      enabled: debug?.value === true,
      source: debug?.source ?? "default",
    };
  } catch {
    return null;
  }
}

export function printDaemonStatus(
  response: StatusResponse,
  options?: { debugEnabled?: boolean | null },
): void {
  const debugEnabled =
    options?.debugEnabled ?? getConfiguredLiveDebugState()?.enabled ?? null;

  console.log(`  Daemon: running`);
  console.log(`  Active slug: ${response.activeSlug || "(none)"}`);
  console.log(`  Status: ${response.connected ? "connected" : "waiting"}`);
  if (typeof response.signalingConnected === "boolean") {
    console.log(`  Signaling: ${response.signalingConnected ? "connected" : "reconnecting"}`);
  }
  console.log(`  Uptime: ${response.uptime}s`);
  console.log(`  Channels: ${response.channels.join(", ") || "(none)"}`);
  console.log(`  Buffered: ${response.bufferedMessages ?? 0} messages`);
  if (debugEnabled !== null) {
    console.log(`  Debug logging: ${debugEnabled ? "enabled" : "disabled"}`);
  }
  if (typeof response.lastError === "string" && response.lastError.length > 0) {
    console.log(`  Last error: ${response.lastError}`);
    if (debugEnabled === false) {
      console.log(
        `  Tip: enable verbose daemon logs with \`${getLiveDebugEnableCommand()}\` and retry.`,
      );
    }
  }
  if (response.logPath) {
    console.log(`  Log: ${response.logPath}`);
  }
  const bridge = response.bridge;
  if (bridge) {
    const bridgeLabel = response.bridgeMode ?? "unknown";
    console.log(`  Bridge: ${bridgeLabel} (${bridge.running ? "running" : "stopped"})`);
    if (bridge.sessionId) {
      console.log(`  Bridge session: ${bridge.sessionId}`);
    }
    if (bridge.sessionSource) {
      console.log(`  Bridge session source: ${bridge.sessionSource}`);
    }
    if (bridge.sessionKey) {
      console.log(`  Bridge session key: ${bridge.sessionKey}`);
    }
    if (bridge.forwardedMessages !== undefined) {
      console.log(`  Bridge forwarded: ${bridge.forwardedMessages} messages`);
    }
    if (bridge.lastError) {
      console.log(`  Bridge last error: ${bridge.lastError}`);
    }
  }
}

export function printLocalRuntimeSummary(): void {
  const saved = readPubConfig();
  const resolved = resolvePubSettings();
  const apiSource = resolved.core.apiKey
    ? resolved.core.apiKey.source === "env"
      ? resolved.core.apiKey.envKey || "env"
      : "saved config"
    : "not configured";
  const bridgeMode =
    getResolvedSettingValue<string>(resolved, "bridge.mode")?.value || "not configured";
  const liveDebug = getResolvedSettingValue<boolean>(resolved, "bridge.debug")?.value === true;

  console.log("Local runtime configuration:");
  console.log(`  API key source: ${apiSource}`);
  console.log(`  Base URL: ${resolved.core.baseUrl.value}`);
  console.log(`  Bridge mode: ${bridgeMode}`);
  console.log(`  Debug logging: ${liveDebug ? "enabled" : "disabled"}`);
  if (saved?.bridge) {
    const configuredKeys = listConfiguredKeys(saved, "bridge");
    console.log(`  Saved bridge keys: ${configuredKeys.join(", ") || "(none)"}`);
  }
}
