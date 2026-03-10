import type { PubBridgeConfig, BridgeSettings, OpenClawBridgeSettings } from "../../../../core/config/index.js";
import { runAgentWritePongProbe } from "../../../runtime/bridge-write-probe.js";
import {
  resolveAutoDetectOpenClawCommandCwd,
  resolveOpenClawRuntime,
  type OpenClawRuntimeResolution,
} from "./discovery.js";
import {
  deliverMessageToOpenClaw,
  runOpenClawPreflight,
} from "./runtime.js";

function getStrictOpenClawCommandCwd(bridgeConfig: OpenClawBridgeSettings): string {
  return bridgeConfig.bridgeCwd;
}

export async function runOpenClawBridgeStartupProbe(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig | BridgeSettings,
  options?: { strictConfig: boolean },
): Promise<OpenClawRuntimeResolution> {
  const strictConfig = options?.strictConfig === true;
  const runtime = strictConfig
    ? {
        openclawPath: (bridgeConfig as OpenClawBridgeSettings).openclawPath,
        sessionId: (bridgeConfig as OpenClawBridgeSettings).sessionId,
        sessionKey: "openclaw.sessionId",
        sessionSource: "config" as const,
      }
    : resolveOpenClawRuntime(env, bridgeConfig);
  if (!runtime.openclawPath || !runtime.sessionId) {
    throw new Error("OpenClaw runtime is not prepared. Run `pub config --auto` again.");
  }
  const probeDeliverySettings = strictConfig
    ? {
        bridgeCwd: getStrictOpenClawCommandCwd(bridgeConfig as OpenClawBridgeSettings),
        deliver: (bridgeConfig as OpenClawBridgeSettings).deliver,
        deliverChannel: (bridgeConfig as OpenClawBridgeSettings).deliverChannel,
        deliverTimeoutMs: (bridgeConfig as OpenClawBridgeSettings).deliverTimeoutMs,
      }
    : {
        bridgeCwd: resolveAutoDetectOpenClawCommandCwd(env),
      };
  await runOpenClawPreflight(runtime.openclawPath, env);
  await runAgentWritePongProbe({
    label: "OpenClaw",
    baseEnv: env,
    execute: async (probeEnv, _signal) => {
      await deliverMessageToOpenClaw(
        {
          openclawPath: runtime.openclawPath,
          sessionId: runtime.sessionId,
          text: [
            "[pub preflight] Connectivity probe.",
            "Run this exact command now:",
            'pub write "pong"',
            "Do not explain. Just execute it.",
          ].join("\n"),
        },
        probeEnv,
        probeDeliverySettings,
      );
    },
  });
  return runtime;
}
