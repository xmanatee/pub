import type { Command } from "commander";
import type {
  ApiClientSettings,
  PubBridgeConfig,
  PubConfig,
  PubTelegramConfig,
  ResolvedPubSettings,
} from "../../core/config/index.js";
import {
  compactPubConfig,
  parseConfigAssignment,
  resolvePubSettingsFromConfig,
  resolvePubSettings,
  setPubConfigValue,
  unsetPubConfigValue,
  writePubConfig,
} from "../../core/config/index.js";
import { autoDetectBridgeConfig, buildBridgeProcessEnv } from "../../live/runtime/bridge-runtime.js";
import { collectValues, resolveConfigureApiKey } from "./io.js";
import { reconcileTelegramConfigChange } from "./reconcile.js";
import { printAutoDetectSummary, printConfigStatus, printMutationSummary } from "./render.js";

interface ConfigureCommandOptions {
  apiKey?: string;
  apiKeyStdin?: boolean;
  auto?: boolean;
  set: string[];
  unset: string[];
}

function clonePubConfig(config: PubConfig | null): PubConfig {
  return {
    core: config?.core ? { ...config.core } : undefined,
    bridge: config?.bridge ? { ...config.bridge } : undefined,
    telegram: config?.telegram ? { ...config.telegram } : undefined,
  };
}

function cloneTelegramConfig(config: PubConfig): PubTelegramConfig {
  return config.telegram ? { ...config.telegram } : {};
}

const OPENCLAW_ONLY_KEYS: (keyof PubBridgeConfig)[] = [
  "openclawPath",
  "openclawStateDir",
  "sessionId",
  "threadId",
  "deliver",
  "deliverChannel",
];

const CLAUDE_ONLY_KEYS: (keyof PubBridgeConfig)[] = [
  "claudeCodePath",
  "claudeCodeModel",
  "claudeCodeAllowedTools",
  "claudeCodeAppendSystemPrompt",
  "claudeCodeMaxTurns",
];

const OPENCLAW_LIKE_ONLY_KEYS: (keyof PubBridgeConfig)[] = ["openclawLikeCommand"];

function stripProviderSpecificBridgeConfig(
  bridgeConfig: PubBridgeConfig | undefined,
  mode: NonNullable<PubBridgeConfig["mode"]>,
): PubBridgeConfig {
  const nextBridge: PubBridgeConfig = { ...(bridgeConfig ?? {}) };
  const keysToDelete: (keyof PubBridgeConfig)[] = [];
  if (mode !== "openclaw") keysToDelete.push(...OPENCLAW_ONLY_KEYS);
  if (mode !== "claude-code" && mode !== "claude-sdk") keysToDelete.push(...CLAUDE_ONLY_KEYS);
  if (mode !== "openclaw-like") keysToDelete.push(...OPENCLAW_LIKE_ONLY_KEYS);

  for (const key of keysToDelete) {
    delete nextBridge[key];
  }

  return nextBridge;
}

function getTelegramApiClientSettingsForMutation(
  nextConfig: PubConfig,
  currentResolved: ResolvedPubSettings,
): ApiClientSettings {
  const nextResolved = resolvePubSettingsFromConfig(nextConfig);
  const apiKey = nextResolved.core.apiKey?.value ?? currentResolved.core.apiKey?.value;

  if (!apiKey) {
    throw new Error("Pub API key is required for Telegram bot token changes.");
  }

  return {
    apiKey,
    baseUrl: nextResolved.core.baseUrl.value,
  };
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
      const resolved = resolvePubSettings();
      const saved = resolved.rawConfig;
      const hasApiUpdate = Boolean(opts.apiKey || opts.apiKeyStdin);
      const hasSet = opts.set.length > 0;
      const hasUnset = opts.unset.length > 0;
      const hasAuto = opts.auto === true;
      const hasMutation = hasApiUpdate || hasSet || hasUnset;

      if (hasAuto && hasMutation) {
        throw new Error("Use `pub config --auto` by itself.");
      }

      if (!hasMutation && !hasAuto) {
        printConfigStatus();
        return;
      }

      if (hasAuto) {
        const bridgeProcessEnv = buildBridgeProcessEnv();
        const result = await autoDetectBridgeConfig(bridgeProcessEnv, resolved.rawConfig.bridge);
        const baseBridge = stripProviderSpecificBridgeConfig(saved.bridge, result.selected.mode);
        const nextBridge: PubBridgeConfig = {
          ...baseBridge,
          ...result.selected.configPatch,
          mode: result.selected.mode,
        };
        const nextConfig = compactPubConfig({
          core: saved.core ? { ...saved.core } : undefined,
          bridge: nextBridge,
          telegram: saved.telegram ? { ...saved.telegram } : undefined,
        });
        writePubConfig(nextConfig);
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
        printMutationSummary();
        return;
      }

      const nextConfig = clonePubConfig(saved);

      if (hasApiUpdate) {
        const apiKey = await resolveConfigureApiKey(opts);
        setPubConfigValue(nextConfig, "apiKey", apiKey);
      }

      for (const entry of opts.set) {
        const { key, value } = parseConfigAssignment(entry);
        setPubConfigValue(nextConfig, key, value);
      }

      for (const key of opts.unset) {
        unsetPubConfigValue(nextConfig, key.trim());
      }

      const nextTelegram = cloneTelegramConfig(nextConfig);
      const shouldReconcileTelegram =
        Boolean(saved.telegram?.botToken?.trim()) || Boolean(nextTelegram.botToken?.trim());

      if (shouldReconcileTelegram) {
        await reconcileTelegramConfigChange({
          previous: saved.telegram,
          next: nextTelegram,
          apiClientSettings: getTelegramApiClientSettingsForMutation(nextConfig, resolved),
        });
      }

      nextConfig.telegram = nextTelegram;
      compactPubConfig(nextConfig);
      writePubConfig(nextConfig);
      console.log("Configuration saved.");
      printMutationSummary();
    });
}
