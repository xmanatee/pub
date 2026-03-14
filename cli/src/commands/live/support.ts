import {
  getResolvedSettingValue,
  listConfiguredKeys,
  readPubConfig,
  resolvePubSettings,
} from "../../core/config/index.js";
import type { SuccessfulIpcResponseFor } from "../../live/transport/ipc-protocol.js";

export function getLiveVerboseEnableCommand(): string {
  return "pub config --set bridge.verbose=true";
}

export function getConfiguredLiveVerboseState(
  env: NodeJS.ProcessEnv = process.env,
): { enabled: boolean } {
  const resolved = resolvePubSettings(env);
  const verbose = getResolvedSettingValue<boolean>(resolved, "bridge.verbose");
  return {
    enabled: verbose?.value === true,
  };
}

export function printDaemonStatus(
  response: SuccessfulIpcResponseFor<"status">,
  options?: { verboseEnabled?: boolean | null },
): void {
  const verboseEnabled = options?.verboseEnabled ?? null;

  console.log(`  Daemon: running`);
  console.log(`  Active slug: ${response.activeSlug || "(none)"}`);
  console.log(`  Connection: ${response.connectionState}`);
  console.log(`  Agent: ${response.agentState}`);
  console.log(`  Executor: ${response.executorState}`);
  if (typeof response.signalingConnected === "boolean") {
    console.log(`  Signaling: ${response.signalingConnected ? "connected" : "reconnecting"}`);
  }
  console.log(`  Uptime: ${response.uptime}s`);
  console.log(`  Channels: ${response.channels.join(", ") || "(none)"}`);

  if (verboseEnabled !== null) {
    console.log(`  Verbose logging: ${verboseEnabled ? "enabled" : "disabled"}`);
  }
  if (typeof response.lastError === "string" && response.lastError.length > 0) {
    console.log(`  Last error: ${response.lastError}`);
    if (verboseEnabled === false) {
      console.log(
        `  Tip: enable verbose daemon logs with \`${getLiveVerboseEnableCommand()}\` and retry.`,
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

export function printLocalRuntimeSummary(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const saved = readPubConfig(env);
  const resolved = resolvePubSettings(env);
  const apiSource = resolved.core.apiKey
    ? resolved.core.apiKey.source === "env"
      ? resolved.core.apiKey.envKey || "env"
      : "saved config"
    : "not configured";
  const bridgeMode =
    getResolvedSettingValue<string>(resolved, "bridge.mode")?.value || "not configured";
  const liveVerbose =
    getResolvedSettingValue<boolean>(resolved, "bridge.verbose")?.value === true;

  console.log("Local runtime configuration:");
  console.log(`  API key source: ${apiSource}`);
  console.log(`  Base URL: ${resolved.core.baseUrl.value}`);
  console.log(`  Bridge mode: ${bridgeMode}`);
  console.log(`  Verbose logging: ${liveVerbose ? "enabled" : "disabled"}`);
  if (saved?.bridge) {
    const configuredKeys = listConfiguredKeys(saved, "bridge");
    console.log(`  Saved bridge keys: ${configuredKeys.join(", ") || "(none)"}`);
  }
}
