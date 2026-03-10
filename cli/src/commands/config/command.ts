import type { Command } from "commander";
import { PubApiClient } from "../../lib/api.js";
import { errorMessage } from "../../lib/cli-error.js";
import type { BridgeConfig, SavedConfig, TelegramConfig } from "../../lib/config.js";
import { readConfig, resolveConfig, saveConfig } from "../../lib/config.js";
import {
  autoDetectBridgeConfig,
  buildBridgeProcessEnv,
  prepareBridgeConfigForSave,
} from "../../lib/live-runtime/bridge-runtime.js";
import { collectValues, resolveConfigureApiKey } from "./io.js";
import { printAutoDetectSummary, printConfigStatus, printMutationSummary } from "./render.js";
import { applyConfigSet, applyConfigUnset, hasValues, parseSetInput } from "./schema.js";
import { telegramGetMe, telegramSetMenuButton } from "./telegram.js";

interface ConfigureCommandOptions {
  apiKey?: string;
  apiKeyStdin?: boolean;
  auto?: boolean;
  set: string[];
  unset: string[];
}

export function registerConfigCommand(program: Command): void {
  program
    .command("config")
    .description("Show configuration status, update settings, or auto-detect a working bridge")
    .option("--api-key <key>", "Set API key (appears in shell history; prefer --api-key-stdin)")
    .option("--api-key-stdin", "Read API key from stdin")
    .option("--auto", "Detect a working bridge, run preflight, and save it")
    .option(
      "--set <key=value>",
      "Set config key (repeatable). Example: --set telegram.botToken=<token>",
      collectValues,
      [],
    )
    .option("--unset <key>", "Unset config key (repeatable)", collectValues, [])
    .action(async (opts: ConfigureCommandOptions) => {
      const saved = readConfig();
      const resolved = resolveConfig();
      const hasApiUpdate = Boolean(opts.apiKey || opts.apiKeyStdin);
      const hasSet = opts.set.length > 0;
      const hasUnset = opts.unset.length > 0;
      const hasAuto = opts.auto === true;
      const hasMutation = hasApiUpdate || hasSet || hasUnset;

      if (hasAuto && hasMutation) {
        throw new Error("Use `pub config --auto` by itself.");
      }

      if (!hasMutation && !hasAuto) {
        printConfigStatus(saved);
        return;
      }

      if (hasAuto) {
        const bridgeProcessEnv = buildBridgeProcessEnv();
        const result = await autoDetectBridgeConfig(bridgeProcessEnv, resolved.bridge);
        const candidateBridge: BridgeConfig = {
          ...resolved.bridge,
          ...result.selected.configPatch,
          mode: result.selected.mode,
        };
        const nextBridge = prepareBridgeConfigForSave(
          result.selected.mode,
          candidateBridge,
          bridgeProcessEnv,
        );
        const nextConfig: SavedConfig = {
          apiKey: saved?.apiKey,
          bridge: nextBridge,
          telegram: saved?.telegram,
        };
        saveConfig(nextConfig);
        printAutoDetectSummary([
          ...result.attempts.map((attempt) => {
            if (!attempt.available) {
              return `${attempt.mode}: unavailable (${attempt.detail})`;
            }
            if (attempt.success) {
              return `${attempt.mode}: ok (${attempt.detail})`;
            }
            return `${attempt.mode}: failed (${attempt.error || attempt.detail})`;
          }),
          `selected: ${result.selected.mode}`,
        ]);
        console.log("");
        console.log("Configuration saved.");
        printMutationSummary(readConfig());
        return;
      }

      let apiKey = saved?.apiKey;
      if (hasApiUpdate) {
        apiKey = await resolveConfigureApiKey(opts);
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
          const resolvedApiKey = apiKey || process.env.PUB_API_KEY?.trim();
          if (!resolvedApiKey) {
            throw new Error("PUB_API_KEY or saved apiKey is required to unset telegram.botToken.");
          }
          try {
            await telegramSetMenuButton(nextTelegram.botToken, { type: "default" });
            console.log("Telegram menu button reset to default.");
          } catch (error) {
            console.error(`Warning: failed to reset Telegram menu button: ${errorMessage(error)}`);
          }
          try {
            const api = new PubApiClient(resolveConfig().baseUrl.value, resolvedApiKey);
            await api.deleteBotToken();
            console.log("Bot token removed from server.");
          } catch (error) {
            console.error(
              `Warning: failed to remove bot token from server: ${errorMessage(error)}`,
            );
          }
        }
        applyConfigUnset(nextBridge, nextTelegram, key.trim());
      }

      if (telegramTokenChanged && nextTelegram.botToken) {
        const resolvedApiKey = apiKey || process.env.PUB_API_KEY?.trim();
        if (!resolvedApiKey) {
          throw new Error("PUB_API_KEY or saved apiKey is required to set telegram.botToken.");
        }
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
          console.log("  Mini App not registered — deep links will open in browser, not Telegram.");
          console.log("    @BotFather → /mybots → your bot → Bot Settings → Configure Mini App");
          console.log("    Set Web App URL to: https://pub.blue");
        }

        const api = new PubApiClient(resolveConfig().baseUrl.value, resolvedApiKey);
        await api.uploadBotToken({
          botToken: nextTelegram.botToken,
          botUsername: bot.username,
        });
        console.log("  Bot token synced to server.");
      }

      const nextConfig: SavedConfig = {
        apiKey,
        bridge: hasValues(nextBridge) ? nextBridge : undefined,
        telegram: hasValues(nextTelegram) ? nextTelegram : undefined,
      };
      saveConfig(nextConfig);
      console.log("Configuration saved.");
      printMutationSummary(readConfig());
    });
}
