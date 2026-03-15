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

function formatProbeFailure(params: {
  openclawPath: string;
  sessionId: string;
  bridgeCwd: string;
  error: unknown;
}): Error {
  const detail = params.error instanceof Error ? params.error.message : String(params.error);

  return new Error(
    [
      "OpenClaw bridge probe failed.",
      detail,
      "",
      "Resolved runtime:",
      `- executable: ${params.openclawPath}`,
      `- sessionId: ${params.sessionId}`,
      `- bridge cwd: ${params.bridgeCwd}`,
      "",
      "Troubleshooting:",
      "- Run `pub config` to verify saved OpenClaw runtime settings.",
      "- Run `pub config --auto` to re-detect.",
      "- Enable verbose logging with `pub config --set bridge.verbose=true`.",
    ].join("\n"),
  );
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
      }
    : resolveOpenClawRuntime(env, bridgeConfig);

  if (!runtime.openclawPath || !runtime.sessionId) {
    throw new Error("OpenClaw runtime is not prepared. Run `pub config --auto` again.");
  }

  const bridgeCwd = strictConfig
    ? (bridgeConfig as OpenClawBridgeSettings).bridgeCwd
    : resolveAutoDetectOpenClawCommandCwd(env);

  await runOpenClawPreflight(runtime.openclawPath, env);

  try {
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
            local: true,
          },
          probeEnv,
          { bridgeCwd },
        );
      },
    });
  } catch (error) {
    throw formatProbeFailure({
      openclawPath: runtime.openclawPath,
      sessionId: runtime.sessionId,
      bridgeCwd,
      error,
    });
  }

  return runtime;
}
