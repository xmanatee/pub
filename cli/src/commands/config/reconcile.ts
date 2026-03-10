import { PubApiClient } from "../../core/api/client.js";
import { errorMessage } from "../../core/errors/cli-error.js";
import type { PubTelegramConfig } from "../../core/config/index.js";
import { resolvePubSettings } from "../../core/config/index.js";
import { telegramGetMe, telegramSetMenuButton } from "./telegram.js";

function resolveTelegramMutationApiKey(explicitApiKey?: string): string {
  const trimmedExplicit = explicitApiKey?.trim();
  if (trimmedExplicit) return trimmedExplicit;

  const resolved = resolvePubSettings();
  const resolvedApiKey = resolved.core.apiKey?.value?.trim();
  if (resolvedApiKey) return resolvedApiKey;

  throw new Error("Pub API key is required for Telegram bot token changes.");
}

function createTelegramApiClient(apiKey: string): PubApiClient {
  const resolved = resolvePubSettings();
  return new PubApiClient(resolved.core.baseUrl.value, apiKey);
}

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function reconcileTelegramConfigChange(params: {
  previous: PubTelegramConfig | undefined;
  next: PubTelegramConfig;
  explicitApiKey?: string;
}): Promise<void> {
  const previousToken = trimToUndefined(params.previous?.botToken);
  const nextToken = trimToUndefined(params.next.botToken);

  if (previousToken && !nextToken) {
    const apiKey = resolveTelegramMutationApiKey(params.explicitApiKey);

    try {
      await telegramSetMenuButton(previousToken, { type: "default" });
      console.log("Telegram menu button reset to default.");
    } catch (error) {
      console.error(`Warning: failed to reset Telegram menu button: ${errorMessage(error)}`);
    }

    try {
      await createTelegramApiClient(apiKey).deleteBotToken();
      console.log("Bot token removed from server.");
    } catch (error) {
      throw new Error(`Failed to remove bot token from server: ${errorMessage(error)}`);
    }

    delete params.next.botUsername;
    delete params.next.hasMainWebApp;
    return;
  }

  if (!nextToken) return;

  if (
    previousToken === nextToken &&
    trimToUndefined(params.next.botUsername) &&
    params.next.hasMainWebApp !== undefined
  ) {
    return;
  }

  const apiKey = resolveTelegramMutationApiKey(params.explicitApiKey);
  console.log("Verifying Telegram bot token...");
  const bot = await telegramGetMe(nextToken);
  params.next.botToken = nextToken;
  params.next.botUsername = bot.username;
  params.next.hasMainWebApp = bot.hasMainWebApp;
  console.log(`  Bot: @${bot.username}`);
  await telegramSetMenuButton(nextToken, {
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

  await createTelegramApiClient(apiKey).uploadBotToken({
    botToken: nextToken,
    botUsername: bot.username,
  });
  console.log("  Bot token synced to server.");
}
