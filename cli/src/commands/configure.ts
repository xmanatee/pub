import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import type { BridgeConfig, SavedConfig } from "../lib/config.js";
import { loadConfig, saveConfig } from "../lib/config.js";
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

function parseBridgeModeValue(raw: string): "openclaw" | "none" {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "openclaw" || normalized === "none") return normalized;
  throw new Error(`Invalid bridge mode: ${raw}. Use openclaw or none.`);
}

function parsePositiveInteger(raw: string, key: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer. Received: ${raw}`);
  }
  return parsed;
}

function applyBridgeSet(bridge: BridgeConfig, key: string, value: string): void {
  switch (key) {
    case "bridge.mode":
      bridge.mode = parseBridgeModeValue(value);
      return;
    case "openclaw.path":
      bridge.openclawPath = value;
      return;
    case "openclaw.sessionId":
      bridge.sessionId = value;
      return;
    case "openclaw.threadId":
      bridge.threadId = value;
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
    default:
      throw new Error(
        [
          `Unknown config key: ${key}`,
          "Supported keys:",
          "  bridge.mode",
          "  openclaw.path",
          "  openclaw.sessionId",
          "  openclaw.threadId",
          "  openclaw.deliver",
          "  openclaw.deliverChannel",
          "  openclaw.replyTo",
          "  openclaw.deliverTimeoutMs",
          "  openclaw.attachmentDir",
          "  openclaw.attachmentMaxBytes",
        ].join("\n"),
      );
  }
}

function applyBridgeUnset(bridge: BridgeConfig, key: string): void {
  switch (key) {
    case "bridge.mode":
      delete bridge.mode;
      return;
    case "openclaw.path":
      delete bridge.openclawPath;
      return;
    case "openclaw.sessionId":
      delete bridge.sessionId;
      return;
    case "openclaw.threadId":
      delete bridge.threadId;
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
    default:
      throw new Error(`Unknown config key for --unset: ${key}`);
  }
}

function hasBridgeValues(bridge: BridgeConfig): boolean {
  return Object.values(bridge).some((value) => value !== undefined);
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return "********";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function printConfigSummary(saved: SavedConfig | null): void {
  if (!saved) {
    console.log("Saved config: none");
    return;
  }

  console.log("Saved config:");
  console.log(`  apiKey: ${maskApiKey(saved.apiKey)}`);
  if (!saved.bridge || !hasBridgeValues(saved.bridge)) {
    console.log("  bridge: none");
    return;
  }

  console.log(`  bridge.mode: ${saved.bridge.mode ?? "(unset)"}`);
  if (saved.bridge.openclawPath) console.log(`  openclaw.path: ${saved.bridge.openclawPath}`);
  if (saved.bridge.sessionId) console.log(`  openclaw.sessionId: ${saved.bridge.sessionId}`);
  if (saved.bridge.threadId) console.log(`  openclaw.threadId: ${saved.bridge.threadId}`);
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
}

export function registerConfigureCommand(program: Command): void {
  program
    .command("configure")
    .description("Configure the CLI with your API key")
    .option("--api-key <key>", "Your API key (less secure: appears in shell history)")
    .option("--api-key-stdin", "Read API key from stdin")
    .option(
      "--set <key=value>",
      "Set advanced config (repeatable). Example: --set openclaw.sessionId=<id>",
      collectValues,
      [],
    )
    .option("--unset <key>", "Unset advanced config key (repeatable)", collectValues, [])
    .option("--show", "Show saved configuration")
    .action(
      async (opts: {
        apiKey?: string;
        apiKeyStdin?: boolean;
        set: string[];
        unset: string[];
        show?: boolean;
      }) => {
        const saved = loadConfig();
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
        for (const entry of opts.set) {
          const { key, value } = parseSetInput(entry);
          applyBridgeSet(nextBridge, key, value);
        }
        for (const key of opts.unset) {
          applyBridgeUnset(nextBridge, key.trim());
        }

        const nextConfig: SavedConfig = {
          apiKey,
          bridge: hasBridgeValues(nextBridge) ? nextBridge : undefined,
        };
        saveConfig(nextConfig);
        console.log("Configuration saved.");
        if (opts.show || hasSet || hasUnset) {
          printConfigSummary(nextConfig);
        }
      },
    );
}
