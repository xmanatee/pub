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

function formatOpenClawProbeFailure(params: {
  openclawPath: string;
  sessionId: string;
  bridgeCwd: string;
  error: unknown;
}): Error {
  const detail = params.error instanceof Error ? params.error.message : String(params.error);
  const isTimeout = detail.includes('did not perform `pub write "pong"`');
  if (isTimeout) {
    return new Error(
      [
        "OpenClaw bridge probe failed: the target session never wrote back `pub write \"pong\"`.",
        "",
        "Resolved runtime:",
        `- executable: ${params.openclawPath}`,
        `- sessionId: ${params.sessionId}`,
        `- bridge cwd: ${params.bridgeCwd}`,
        "",
        "Possible causes:",
        "- `openclaw.sessionId` points at the wrong or inactive session.",
        "- The selected OpenClaw session cannot execute `pub write`.",
        "- The selected session ignored the instruction or was busy.",
        "- A wrapper script intercepted or altered the OpenClaw invocation.",
        "",
        "Debug tips:",
        "- In that exact OpenClaw session, verify that `pub write \"pong\"` works.",
        "- Enable verbose daemon logging with `pub config --set bridge.debug=true` before retrying.",
      ].join("\n"),
    );
  }

  return new Error(
    [
      "OpenClaw bridge probe failed before the `pong` roundtrip completed.",
      detail,
      "",
      "Resolved runtime:",
      `- executable: ${params.openclawPath}`,
      `- sessionId: ${params.sessionId}`,
      `- bridge cwd: ${params.bridgeCwd}`,
      "",
      "Debug tips:",
      "- Run `pub config` to verify the saved OpenClaw runtime settings.",
      "- Verify that the selected OpenClaw executable and session id are correct.",
      "- Enable verbose daemon logging with `pub config --set bridge.debug=true` before retrying.",
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
        sessionKey: "openclaw.sessionId",
        sessionSource: "config" as const,
      }
    : resolveOpenClawRuntime(env, bridgeConfig);
  if (!runtime.openclawPath || !runtime.sessionId) {
    throw new Error("OpenClaw runtime is not prepared. Run `pub config --auto` again.");
  }
  const probeDeliverySettings = {
    bridgeCwd: strictConfig
      ? getStrictOpenClawCommandCwd(bridgeConfig as OpenClawBridgeSettings)
      : resolveAutoDetectOpenClawCommandCwd(env),
  };
  try {
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
  } catch (error) {
    throw formatOpenClawProbeFailure({
      openclawPath: runtime.openclawPath,
      sessionId: runtime.sessionId,
      bridgeCwd: probeDeliverySettings.bridgeCwd,
      error,
    });
  }
  return runtime;
}
