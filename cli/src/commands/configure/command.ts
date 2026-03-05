import type { Command } from "commander";
import { errorMessage } from "../../lib/cli-error.js";
import type { BridgeConfig, SavedConfig, TelegramConfig } from "../../lib/config.js";
import { readConfig, saveConfig } from "../../lib/config.js";
import { collectValues, resolveConfigureApiKey } from "./io.js";
import { printConfigSummary } from "./render.js";
import { applyConfigSet, applyConfigUnset, hasValues, parseSetInput } from "./schema.js";
import { telegramGetMe, telegramSetMenuButton } from "./telegram.js";

interface ConfigureCommandOptions {
  apiKey?: string;
  apiKeyStdin?: boolean;
  set: string[];
  unset: string[];
  show?: boolean;
}

export function registerConfigureCommand(program: Command): void {
  program
    .command("configure")
    .description("Configure the CLI with your API key")
    .option("--api-key <key>", "Your API key (less secure: appears in shell history)")
    .option("--api-key-stdin", "Read API key from stdin")
    .option(
      "--set <key=value>",
      "Set config key (repeatable). Example: --set telegram.botToken=<token>",
      collectValues,
      [],
    )
    .option("--unset <key>", "Unset config key (repeatable)", collectValues, [])
    .option("--show", "Show saved configuration")
    .action(async (opts: ConfigureCommandOptions) => {
      const saved = readConfig();
      const hasApiUpdate = Boolean(opts.apiKey || opts.apiKeyStdin);
      const hasSet = opts.set.length > 0;
      const hasUnset = opts.unset.length > 0;
      const hasMutation = hasApiUpdate || hasSet || hasUnset;

      if (!hasMutation && opts.show) {
        printConfigSummary(saved);
        return;
      }

      let apiKey = saved?.apiKey;
      if (hasApiUpdate || !hasMutation) {
        apiKey = await resolveConfigureApiKey(opts);
      }
      if (!apiKey) {
        const envKey = process.env.PUBBLUE_API_KEY?.trim();
        if (envKey) {
          apiKey = envKey;
        } else {
          throw new Error(
            "No API key available. Provide --api-key/--api-key-stdin (or run plain `pubblue configure` first).",
          );
        }
      }

      const nextBridge: BridgeConfig = { ...(saved?.bridge ?? {}) };
      const nextTelegram: TelegramConfig = { ...(saved?.telegram ?? {}) };
      let telegramTokenChanged = false;

      for (const entry of opts.set) {
        const { key, value } = parseSetInput(entry);
        applyConfigSet(nextBridge, nextTelegram, key, value);
        if (key === "telegram.botToken") telegramTokenChanged = true;
      }
      for (const key of opts.unset) {
        if (key.trim() === "telegram.botToken" && nextTelegram.botToken) {
          try {
            await telegramSetMenuButton(nextTelegram.botToken, { type: "default" });
            console.log("Telegram menu button reset to default.");
          } catch (error) {
            console.error(`Warning: failed to reset Telegram menu button: ${errorMessage(error)}`);
          }
        }
        applyConfigUnset(nextBridge, nextTelegram, key.trim());
      }

      if (telegramTokenChanged && nextTelegram.botToken) {
        console.log("Verifying Telegram bot token...");
        const bot = await telegramGetMe(nextTelegram.botToken);
        nextTelegram.botUsername = bot.username;
        nextTelegram.hasMainWebApp = bot.hasMainWebApp;
        console.log(`  Bot: @${bot.username}`);
        await telegramSetMenuButton(nextTelegram.botToken, {
          type: "web_app",
          text: "Open",
          web_app: { url: "https://pub.blue" },
        });
        console.log("  Menu button set to https://pub.blue");
        if (!bot.hasMainWebApp) {
          console.log("");
          console.log("  INFO: For deep links to open inside Telegram, register the Mini App:");
          console.log("    @BotFather → /mybots → your bot → Bot Settings → Configure Mini App");
          console.log("    Set Web App URL to: https://pub.blue");
        }
      }

      const nextConfig: SavedConfig = {
        apiKey,
        bridge: hasValues(nextBridge) ? nextBridge : undefined,
        telegram: hasValues(nextTelegram) ? nextTelegram : undefined,
      };
      saveConfig(nextConfig);
      console.log("Configuration saved.");
      if (opts.show || hasSet || hasUnset) {
        printConfigSummary(nextConfig);
      }
    });
}
