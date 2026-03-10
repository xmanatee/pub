import type {
  BridgeConfig,
  ResolvedConfig,
  SavedConfig,
  TelegramConfig,
} from "../../core/config/index.js";
import { resolveConfig, resolveConfigLocation } from "../../core/config/index.js";
import {
  CONFIG_KEY_REGISTRY,
  type ConfigKeyDef,
  hasValues,
} from "./schema.js";

function maskSecret(value: string): string {
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatFieldValue(value: unknown, def: ConfigKeyDef): string {
  if (def.displayAs === "set-only") return "(set)";
  if (def.type === "boolean") return value ? "true" : "false";
  return String(value);
}

function formatSourceLabel(source: string, envKey?: string): string {
  if (source === "env") return envKey ? `env:${envKey}` : "env";
  return source;
}

function printValue(label: string, value: string, source: string): void {
  console.log(`  ${label}: ${value} (${source})`);
}

function printBridgeStatus(savedBridge: BridgeConfig | undefined, resolvedBridge: BridgeConfig): void {
  if (!hasValues(resolvedBridge)) return;

  console.log("");
  console.log("Bridge:");
  for (const [key, def] of Object.entries(CONFIG_KEY_REGISTRY)) {
    if (def.target !== "bridge") continue;
    const field = def.field as keyof BridgeConfig;
    const value = resolvedBridge[field];
    if (value === undefined) continue;
    const source = savedBridge?.[field] !== undefined ? "config" : "config";
    printValue(key, formatFieldValue(value, def), source);
  }
}

function printTelegramStatus(telegram?: TelegramConfig): void {
  console.log("");
  console.log("Telegram:");
  const printed = new Set<string>();
  if (telegram?.botToken) {
    printValue("telegram.botToken", maskSecret(telegram.botToken), "config");
    printed.add("telegram.botToken");
  }
  if (telegram?.botUsername) {
    printValue("telegram.botUsername", telegram.botUsername, "config");
    printed.add("telegram.botUsername");
  }
  if (telegram?.hasMainWebApp !== undefined) {
    printValue(
      "telegram.hasMainWebApp",
      telegram.hasMainWebApp ? "true" : "false",
      "config",
    );
    printed.add("telegram.hasMainWebApp");
  }

  if (printed.size === 0) {
    console.log("  not configured");
  }
}

function printSetupInstructions(saved: SavedConfig | null, resolved: ResolvedConfig): void {
  const needsApiKey = !resolved.apiKey;
  const needsBridge = !resolved.bridge.mode;
  const needsTelegram = !saved?.telegram?.botUsername;

  if (!needsApiKey && !needsBridge && !needsTelegram) return;

  console.log("");
  console.log("Next steps:");

  if (needsApiKey) {
    console.log("  pub config --api-key <KEY>");
    console.log("    Get your key at https://pub.blue/dashboard");
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

export function printConfigStatus(saved: SavedConfig | null): void {
  const location = resolveConfigLocation();
  const resolved = resolveConfig();

  console.log(`Config directory: ${location.dir} (${location.source})`);
  console.log(`Config file: ${location.path}`);

  console.log("");
  console.log("Core:");
  if (resolved.apiKey) {
    printValue(
      "apiKey",
      maskSecret(resolved.apiKey.value),
      formatSourceLabel(resolved.apiKey.source, resolved.apiKey.envKey),
    );
  } else {
    console.log("  apiKey: not set");
  }
  printValue(
    "baseUrl",
    resolved.baseUrl.value,
    formatSourceLabel(resolved.baseUrl.source, resolved.baseUrl.envKey),
  );

  printBridgeStatus(saved?.bridge, resolved.bridge);
  printTelegramStatus(saved?.telegram);
  printSetupInstructions(saved, resolved);
}

export function printMutationSummary(saved: SavedConfig | null): void {
  printConfigStatus(saved);
}

export function printAutoDetectSummary(lines: string[]): void {
  console.log("Bridge auto-detect:");
  for (const line of lines) {
    console.log(`  ${line}`);
  }
}
