import type { BridgeSettings, ClaudeChannelBridgeSettings, PubBridgeConfig } from "../../../../core/config/index.js";
import { probeChannelSocket, resolveChannelSocketPath } from "./discovery.js";

export async function runClaudeChannelBridgeStartupProbe(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig | BridgeSettings,
  options?: { strictConfig: boolean },
): Promise<{ socketPath: string }> {
  const socketPath =
    options?.strictConfig && bridgeConfig
      ? (bridgeConfig as ClaudeChannelBridgeSettings).channelSocketPath ??
        resolveChannelSocketPath(env, bridgeConfig)
      : resolveChannelSocketPath(env, bridgeConfig);

  await probeChannelSocket(socketPath);
  return { socketPath };
}
