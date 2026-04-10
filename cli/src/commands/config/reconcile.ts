import { PubApiClient } from "../../core/api/client.js";
import type { ApiClientSettings, PubTelegramConfig } from "../../core/config/index.js";
import { telegramGetMe, telegramSetMenuButton } from "./telegram.js";

function requireTelegramApiClientSettings(
  apiClientSettings?: ApiClientSettings,
): ApiClientSettings {
  if (apiClientSettings?.apiKey.trim()) return apiClientSettings;
  throw new Error("Pub API key is required for Telegram bot token changes.");
}

function createTelegramApiClient(apiClientSettings: ApiClientSettings): PubApiClient {
  return new PubApiClient(apiClientSettings.baseUrl, apiClientSettings.apiKey);
}

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function reconcileTelegramConfigChange(params: {
  previous: PubTelegramConfig | undefined;
  next: PubTelegramConfig;
  apiClientSettings?: ApiClientSettings;
}): Promise<void> {
  const previousToken = trimToUndefined(params.previous?.botToken);
  const nextToken = trimToUndefined(params.next.botToken);

  const previous = params.previous;
  if (previousToken && previous?.botUsername && !nextToken) {
    const apiClientSettings = requireTelegramApiClientSettings(params.apiClientSettings);

    await telegramSetMenuButton(previousToken, { type: "default" });
    console.log("Telegram menu button reset to default.");
    await createTelegramApiClient(apiClientSettings).deleteBotToken({
      botUsername: previous.botUsername,
    });
    console.log("Bot token removed from server.");
    delete params.next.botToken;
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

  const apiClientSettings = requireTelegramApiClientSettings(params.apiClientSettings);
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

  await createTelegramApiClient(apiClientSettings).uploadBotToken({
    botToken: nextToken,
    botUsername: bot.username,
  });
  console.log("  Bot token synced to server.");
}
