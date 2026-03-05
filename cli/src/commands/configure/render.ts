import type { BridgeConfig, SavedConfig, TelegramConfig } from "../../lib/config.js";
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

function printBridgeConfig(bridge: BridgeConfig): void {
  if (!hasValues(bridge)) {
    console.log("  bridge: none");
    return;
  }
  for (const [key, def] of Object.entries(CONFIG_KEY_REGISTRY)) {
    if (def.target !== "bridge") continue;
    const value = bridge[def.field as keyof BridgeConfig];
    if (value === undefined) continue;
    console.log(`  ${key}: ${formatFieldValue(value, def)}`);
  }
}

function printTelegramConfig(telegram?: TelegramConfig): void {
  if (telegram?.botToken && telegram.botUsername) {
    console.log(`  telegram.botToken: ${maskSecret(telegram.botToken)}`);
    console.log(`  telegram.botUsername: @${telegram.botUsername}`);
    if (!telegram.hasMainWebApp) {
      console.log("    INFO: Register Mini App in @BotFather for deep links to open in Telegram");
    }
  } else if (telegram?.botToken) {
    console.log(`  telegram.botToken: ${maskSecret(telegram.botToken)}`);
    console.log("  telegram.botUsername: (not resolved)");
  } else {
    console.log("  telegram: not configured");
    console.log("    INFO: Set telegram.botToken to enable Telegram Mini App links");
    console.log("    Example: pubblue configure --set telegram.botToken=<BOT_TOKEN>");
  }
}

export function printConfigSummary(saved: SavedConfig | null): void {
  if (!saved) {
    console.log("Saved config: none");
    return;
  }
  console.log("Saved config:");
  console.log(`  apiKey: ${maskSecret(saved.apiKey)}`);
  printBridgeConfig(saved.bridge ?? {});
  printTelegramConfig(saved.telegram);
}
