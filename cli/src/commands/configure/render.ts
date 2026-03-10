import type { BridgeConfig, SavedConfig, TelegramConfig } from "../../lib/config.js";
import { getConfigDir } from "../../lib/config.js";
import { CONFIG_KEY_REGISTRY, type ConfigKeyDef, hasValues } from "./schema.js";

function maskSecret(value: string): string {
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatFieldValue(value: unknown, def: ConfigKeyDef): string {
  if (def.displayAs === "set-only") return "(set)";
  if (def.type === "boolean") return value ? "true" : "false";
  return String(value);
}

function printBridgeStatus(bridge: BridgeConfig): void {
  if (!hasValues(bridge)) return;
  console.log("");
  console.log("Bridge:");
  for (const [key, def] of Object.entries(CONFIG_KEY_REGISTRY)) {
    if (def.target !== "bridge") continue;
    const value = bridge[def.field as keyof BridgeConfig];
    if (value === undefined) continue;
    console.log(`  ${key}: ${formatFieldValue(value, def)}`);
  }
}

function printTelegramStatus(telegram?: TelegramConfig): void {
  if (telegram?.botToken && telegram.botUsername) {
    console.log(`  Telegram:  @${telegram.botUsername}`);
    if (!telegram.hasMainWebApp) {
      console.log(
        "      Mini App not registered — deep links open in browser, not inside Telegram.",
      );
      console.log(
        `      Fix: @BotFather → /mybots → @${telegram.botUsername} → Bot Settings → Configure Mini App`,
      );
      console.log("      Set URL to: https://pub.blue");
    }
  } else {
    console.log("  Telegram:  not configured");
  }
}

function printSetupInstructions(saved: SavedConfig | null): void {
  const needsApiKey = !saved?.apiKey;
  const needsTelegram = !saved?.telegram?.botUsername;

  if (!needsApiKey && !needsTelegram) return;

  console.log("");

  if (needsApiKey) {
    console.log("  pub configure --api-key <KEY>");
    console.log("    Get your key at https://pub.blue/dashboard");
    if (needsTelegram) console.log("");
  }

  if (needsTelegram) {
    console.log("  pub configure --set telegram.botToken=<TOKEN>  (optional)");
    console.log("    Prints a t.me/<bot> deep link when you create or update a pub.");
    console.log("    Requires a Telegram bot with Mini App URL set to https://pub.blue");
    console.log("    (@BotFather → /newbot → Bot Settings → Configure Mini App)");
  }
}

export function printConfigStatus(saved: SavedConfig | null): void {
  console.log(`Config directory: ${getConfigDir()}`);
  console.log("  API key:   %s", saved?.apiKey ? maskSecret(saved.apiKey) : "not set");
  printTelegramStatus(saved?.telegram);
  printBridgeStatus(saved?.bridge ?? {});
  printSetupInstructions(saved);
}

export function printMutationSummary(config: SavedConfig): void {
  console.log("  API key:   %s", maskSecret(config.apiKey));
  printTelegramStatus(config.telegram);
  printBridgeStatus(config.bridge ?? {});
}
