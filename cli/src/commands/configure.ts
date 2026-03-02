import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import type { BridgeConfig, SavedConfig, TelegramConfig } from "../lib/config.js";
import { readConfig, saveConfig } from "../lib/config.js";
import { readFromStdin } from "./shared.js";

function readApiKeyFromPrompt(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return rl
    .question("Enter API key: ")
    .then((answer) => answer.trim())
    .finally(() => {
      rl.close();
    });
}

async function resolveConfigureApiKey(opts: {
  apiKey?: string;
  apiKeyStdin?: boolean;
}): Promise<string> {
  if (opts.apiKey && opts.apiKeyStdin) {
    throw new Error("Use only one of --api-key or --api-key-stdin.");
  }
  if (opts.apiKey) {
    return opts.apiKey.trim();
  }
  if (opts.apiKeyStdin) {
    return readFromStdin();
  }

  const envKey = process.env.PUBBLUE_API_KEY?.trim();
  if (envKey) return envKey;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "No TTY available. Provide --api-key, --api-key-stdin, or PUBBLUE_API_KEY for configure.",
    );
  }

  return readApiKeyFromPrompt();
}

function collectValues(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function parseSetInput(raw: string): { key: string; value: string } {
  const sepIndex = raw.indexOf("=");
  if (sepIndex <= 0 || sepIndex === raw.length - 1) {
    throw new Error(`Invalid --set entry "${raw}". Use key=value.`);
  }
  return {
    key: raw.slice(0, sepIndex).trim(),
    value: raw.slice(sepIndex + 1).trim(),
  };
}

function parseBooleanValue(raw: string, key: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on")
    return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off")
    return false;
  throw new Error(`Invalid boolean value for ${key}: ${raw}`);
}

function parsePositiveInteger(raw: string, key: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer. Received: ${raw}`);
  }
  return parsed;
}

export const SUPPORTED_KEYS = [
  "openclaw.path",
  "openclaw.sessionId",
  "openclaw.threadId",
  "openclaw.canvasReminderEvery",
  "openclaw.deliver",
  "openclaw.deliverChannel",
  "openclaw.replyTo",
  "openclaw.deliverTimeoutMs",
  "openclaw.attachmentDir",
  "openclaw.attachmentMaxBytes",
  "telegram.botToken",
];

function applyConfigSet(
  bridge: BridgeConfig,
  telegram: TelegramConfig,
  key: string,
  value: string,
): void {
  switch (key) {
    case "openclaw.path":
      bridge.openclawPath = value;
      return;
    case "openclaw.sessionId":
      bridge.sessionId = value;
      return;
    case "openclaw.threadId":
      bridge.threadId = value;
      return;
    case "openclaw.canvasReminderEvery":
      bridge.canvasReminderEvery = parsePositiveInteger(value, key);
      return;
    case "openclaw.deliver":
      bridge.deliver = parseBooleanValue(value, key);
      return;
    case "openclaw.deliverChannel":
      bridge.deliverChannel = value;
      return;
    case "openclaw.replyTo":
      bridge.replyTo = value;
      return;
    case "openclaw.deliverTimeoutMs":
      bridge.deliverTimeoutMs = parsePositiveInteger(value, key);
      return;
    case "openclaw.attachmentDir":
      bridge.attachmentDir = value;
      return;
    case "openclaw.attachmentMaxBytes":
      bridge.attachmentMaxBytes = parsePositiveInteger(value, key);
      return;
    case "telegram.botToken":
      telegram.botToken = value;
      return;
    default:
      throw new Error(
        [
          `Unknown config key: ${key}`,
          "Supported keys:",
          ...SUPPORTED_KEYS.map((k) => `  ${k}`),
        ].join("\n"),
      );
  }
}

function applyConfigUnset(bridge: BridgeConfig, telegram: TelegramConfig, key: string): void {
  switch (key) {
    case "openclaw.path":
      delete bridge.openclawPath;
      return;
    case "openclaw.sessionId":
      delete bridge.sessionId;
      return;
    case "openclaw.threadId":
      delete bridge.threadId;
      return;
    case "openclaw.canvasReminderEvery":
      delete bridge.canvasReminderEvery;
      return;
    case "openclaw.deliver":
      delete bridge.deliver;
      return;
    case "openclaw.deliverChannel":
      delete bridge.deliverChannel;
      return;
    case "openclaw.replyTo":
      delete bridge.replyTo;
      return;
    case "openclaw.deliverTimeoutMs":
      delete bridge.deliverTimeoutMs;
      return;
    case "openclaw.attachmentDir":
      delete bridge.attachmentDir;
      return;
    case "openclaw.attachmentMaxBytes":
      delete bridge.attachmentMaxBytes;
      return;
    case "telegram.botToken":
      delete telegram.botToken;
      delete telegram.botUsername;
      delete telegram.hasMainWebApp;
      return;
    default:
      throw new Error(`Unknown config key for --unset: ${key}`);
  }
}

function hasValues(obj: object): boolean {
  return Object.values(obj).some((value) => value !== undefined);
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

interface TelegramBotInfo {
  username: string;
  hasMainWebApp: boolean;
}

async function telegramGetMe(token: string): Promise<TelegramBotInfo> {
  const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = (await resp.json()) as {
    ok: boolean;
    result?: { username: string; has_main_web_app?: boolean };
    description?: string;
  };
  if (!data.ok || !data.result?.username) {
    throw new Error(data.description ?? "Invalid bot token");
  }
  return {
    username: data.result.username,
    hasMainWebApp: data.result.has_main_web_app === true,
  };
}

async function telegramSetMenuButton(token: string, button: object): Promise<void> {
  const resp = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ menu_button: button }),
  });
  const data = (await resp.json()) as { ok: boolean; description?: string };
  if (!data.ok) {
    throw new Error(data.description ?? "setChatMenuButton failed");
  }
}

function printConfigSummary(saved: SavedConfig | null): void {
  if (!saved) {
    console.log("Saved config: none");
    return;
  }

  console.log("Saved config:");
  console.log(`  apiKey: ${maskSecret(saved.apiKey)}`);

  if (saved.bridge && hasValues(saved.bridge)) {
    if (saved.bridge.openclawPath) console.log(`  openclaw.path: ${saved.bridge.openclawPath}`);
    if (saved.bridge.sessionId) console.log(`  openclaw.sessionId: ${saved.bridge.sessionId}`);
    if (saved.bridge.threadId) console.log(`  openclaw.threadId: ${saved.bridge.threadId}`);
    if (saved.bridge.canvasReminderEvery !== undefined)
      console.log(`  openclaw.canvasReminderEvery: ${saved.bridge.canvasReminderEvery}`);
    if (saved.bridge.deliver !== undefined)
      console.log(`  openclaw.deliver: ${saved.bridge.deliver ? "true" : "false"}`);
    if (saved.bridge.deliverChannel)
      console.log(`  openclaw.deliverChannel: ${saved.bridge.deliverChannel}`);
    if (saved.bridge.replyTo) console.log(`  openclaw.replyTo: ${saved.bridge.replyTo}`);
    if (saved.bridge.deliverTimeoutMs !== undefined)
      console.log(`  openclaw.deliverTimeoutMs: ${saved.bridge.deliverTimeoutMs}`);
    if (saved.bridge.attachmentDir)
      console.log(`  openclaw.attachmentDir: ${saved.bridge.attachmentDir}`);
    if (saved.bridge.attachmentMaxBytes !== undefined)
      console.log(`  openclaw.attachmentMaxBytes: ${saved.bridge.attachmentMaxBytes}`);
  } else {
    console.log("  bridge: none");
  }

  if (saved.telegram?.botToken && saved.telegram.botUsername) {
    console.log(`  telegram.botToken: ${maskSecret(saved.telegram.botToken)}`);
    console.log(`  telegram.botUsername: @${saved.telegram.botUsername}`);
    if (!saved.telegram.hasMainWebApp) {
      console.log("    INFO: Register Mini App in @BotFather for deep links to open in Telegram");
    }
  } else if (saved.telegram?.botToken) {
    console.log(`  telegram.botToken: ${maskSecret(saved.telegram.botToken)}`);
    console.log("  telegram.botUsername: (not resolved)");
  } else {
    console.log("  telegram: not configured");
    console.log("    INFO: Set telegram.botToken to enable Telegram Mini App links");
    console.log("    Example: pubblue configure --set telegram.botToken=<BOT_TOKEN>");
  }
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
    .action(
      async (opts: {
        apiKey?: string;
        apiKeyStdin?: boolean;
        set: string[];
        unset: string[];
        show?: boolean;
      }) => {
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
              console.error(
                `Warning: failed to reset Telegram menu button: ${error instanceof Error ? error.message : String(error)}`,
              );
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
      },
    );
}
