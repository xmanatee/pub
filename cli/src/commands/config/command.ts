import type { Command } from "commander";
import type {
  PubBridgeConfig,
  PubConfig,
  PubTelegramConfig,
} from "../../core/config/index.js";
import {
  compactPubConfig,
  getApiClientSettingsFromConfig,
  parseConfigAssignment,
  resolvePubSettings,
  setPubConfigValue,
  unsetPubConfigValue,
  writePubConfig,
} from "../../core/config/index.js";
import {
  autoDetectBridgeConfig,
  buildBridgeProcessEnv,
} from "../../live/runtime/bridge-runtime.js";
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
        const nextBridge: PubBridgeConfig = {
          ...(saved.bridge ?? {}),
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
          apiClientSettings: getApiClientSettingsFromConfig(nextConfig),
        });
      }

      nextConfig.telegram = nextTelegram;
      compactPubConfig(nextConfig);
      writePubConfig(nextConfig);
      console.log("Configuration saved.");
      printMutationSummary();
    });
}
