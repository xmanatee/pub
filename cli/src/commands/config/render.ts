import type { ResolvedPubSettings } from "../../core/config/index.js";
import {
  getConfigVarsBySection,
  getResolvedSettingValue,
  resolveConfigLocation,
  resolvePubSettings,
} from "../../core/config/index.js";
import type { ConfigVarDefinition } from "../../core/config/registry.js";

function maskSecret(value: string): string {
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatFieldValue(value: unknown, definition: ConfigVarDefinition): string {
  if (definition.displayAs === "set-only") return "(set)";
  if (definition.secret && typeof value === "string") return maskSecret(value);
  if (definition.type === "boolean") return value ? "true" : "false";
  return String(value);
}

function formatSourceLabel(source: string, envKey?: string): string {
  return source === "env" ? (envKey ? `env:${envKey}` : "env") : source;
}

function printValue(label: string, value: string, source: string): void {
  console.log(`  ${label}: ${value} (${source})`);
}

function printSection(title: string, section: "core" | "bridge" | "telegram", resolved: ResolvedPubSettings): void {
  const entries = getConfigVarsBySection(section)
    .map((definition) => ({
      definition,
      resolvedValue: getResolvedSettingValue(resolved, definition.key),
    }))
    .filter(
      (
        entry,
      ): entry is {
        definition: ConfigVarDefinition;
        resolvedValue: NonNullable<ReturnType<typeof getResolvedSettingValue>>;
      } => entry.resolvedValue !== null,
    );

  if (entries.length === 0) {
    if (section === "telegram") {
      console.log("");
      console.log("Telegram:");
      console.log("  not configured");
    }
    return;
  }

  console.log("");
  console.log(title);
  for (const { definition, resolvedValue } of entries) {
    printValue(
      definition.key,
      formatFieldValue(resolvedValue.value, definition),
      formatSourceLabel(resolvedValue.source, resolvedValue.envKey),
    );
  }
}

function printSetupInstructions(resolved: ResolvedPubSettings): void {
  const needsApiKey = !resolved.core.apiKey;
  const needsBridge = !getResolvedSettingValue(resolved, "bridge.mode");
  const needsTelegram = !getResolvedSettingValue(resolved, "telegram.botUsername");

  if (!needsApiKey && !needsBridge && !needsTelegram) return;

  console.log("");
  console.log("Next steps:");

  if (needsApiKey) {
    console.log("  pub config --api-key <KEY>");
    console.log("    Get your key at https://pub.blue/agents");
  }

  if (needsBridge) {
    console.log("  pub config --auto");
    console.log("    Detects a working bridge, runs preflight, and saves the result.");
  }

  if (needsTelegram) {
    console.log("  pub config --set telegram.botToken=<TOKEN>  (optional)");
    console.log("    Prints a t.me/<bot> deep link when you create or update a pub.");
    console.log("    Requires a Telegram bot with Mini App URL set to https://pub.blue");
  }
}

export function printConfigStatus(): void {
  const location = resolveConfigLocation();
  const resolved = resolvePubSettings();

  console.log(`Config directory: ${location.dir} (${location.source})`);
  console.log(`Config file: ${location.path}`);

  printSection("Core:", "core", resolved);
  printSection("Bridge:", "bridge", resolved);
  printSection("Telegram:", "telegram", resolved);
  printSetupInstructions(resolved);
}

export function printMutationSummary(): void {
  printConfigStatus();
}

export function printAutoDetectSummary(lines: string[]): void {
  console.log("Bridge auto-detect:");
  for (const line of lines) {
    console.log(`  ${line}`);
  }
}
