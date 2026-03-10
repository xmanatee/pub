import { readConfig, resolveConfig } from "../../core/config/index.js";

export function printLocalRuntimeSummary(): void {
  const saved = readConfig();
  const resolved = resolveConfig();
  const apiSource = resolved.apiKey
    ? resolved.apiKey.source === "env"
      ? resolved.apiKey.envKey || "env"
      : "saved config"
    : "not configured";
  const bridgeMode = resolved.bridge.mode || "not configured";

  console.log("Local runtime configuration:");
  console.log(`  API key source: ${apiSource}`);
  console.log(`  Base URL: ${resolved.baseUrl.value}`);
  console.log(`  Bridge mode: ${bridgeMode}`);
  if (saved?.bridge) {
    const configuredKeys = Object.keys(saved.bridge);
    console.log(`  Saved bridge keys: ${configuredKeys.join(", ") || "(none)"}`);
  }
}
