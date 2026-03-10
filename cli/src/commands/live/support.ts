import {
  getResolvedSettingValue,
  listConfiguredKeys,
  readPubConfig,
  resolvePubSettings,
} from "../../core/config/index.js";

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

  console.log("Local runtime configuration:");
  console.log(`  API key source: ${apiSource}`);
  console.log(`  Base URL: ${resolved.core.baseUrl.value}`);
  console.log(`  Bridge mode: ${bridgeMode}`);
  if (saved?.bridge) {
    const configuredKeys = listConfiguredKeys(saved, "bridge");
    console.log(`  Saved bridge keys: ${configuredKeys.join(", ") || "(none)"}`);
  }
}
