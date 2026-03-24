import { existsSync } from "node:fs";
import * as net from "node:net";
import type { PubBridgeConfig } from "../../../../core/config/index.js";
import { defaultChannelSocketPath } from "./relay-protocol.js";

export function resolveChannelSocketPath(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): string {
  return (
    env.PUB_CHANNEL_SOCKET_PATH?.trim() ||
    bridgeConfig?.channelSocketPath?.trim() ||
    defaultChannelSocketPath()
  );
}

export function isChannelSocketAvailable(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig,
): boolean {
  const socketPath = resolveChannelSocketPath(env, bridgeConfig);
  return existsSync(socketPath);
}

export function probeChannelSocket(socketPath: string, timeoutMs = 5_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.destroy();
      reject(new Error(`Channel socket probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const conn = net.createConnection(socketPath, () => {
      clearTimeout(timer);
      conn.destroy();
      resolve();
    });

    conn.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Channel socket probe failed: ${err.message}`));
    });
  });
}
