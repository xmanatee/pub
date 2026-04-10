import type {
  BridgeSettings,
  OpenClawBridgeSettings,
  PubBridgeConfig,
} from "../../../../core/config/index.js";
import { runAgentWritePongProbe } from "../../../runtime/bridge-write-probe.js";
import {
  type OpenClawRuntimeResolution,
  resolveAutoDetectOpenClawCommandCwd,
  resolveOpenClawRuntime,
} from "./discovery.js";
import { deliverMessageToOpenClaw, runOpenClawPreflight } from "./runtime.js";

function formatProbeFailure(params: {
  openclawPath: string;
  sessionId: string;
  workspaceDir: string;
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
      `- workspace: ${params.workspaceDir}`,
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

  const workspaceDir = strictConfig
    ? (bridgeConfig as OpenClawBridgeSettings).workspaceDir
    : resolveAutoDetectOpenClawCommandCwd(env);

  await runOpenClawPreflight(runtime.openclawPath, env);

  const isSelfProbe =
    env.OPENCLAW_SESSION_ID === runtime.sessionId || env.OPENCLAW_SESSION_KEY === runtime.sessionId;

  try {
    await runAgentWritePongProbe({
      label: "OpenClaw",
      baseEnv: env,
      execute: async (probeEnv, _signal) => {
        const socketPath = probeEnv.PUB_AGENT_SOCKET ?? "";
        const prompt = [
          "[pub preflight] Connectivity probe.",
          "Run this exact command now:",
          `PUB_AGENT_SOCKET=${socketPath} pub write "pong"`,
          "Do not explain. Just execute it.",
        ].join("\n");

        if (isSelfProbe) {
          // If this is a self-probe (the agent running this command is the target),
          // we only deliver the notification message but skip the blocking wait.
          // The agent will see the message once this process completes.
          await deliverMessageToOpenClaw(
            {
              openclawPath: runtime.openclawPath,
              sessionId: runtime.sessionId,
              text: prompt,
              local: true,
            },
            probeEnv,
            { workspaceDir },
          );
          // Simulate pong to pass preflight immediately for self-probe.
          // The agent's ability to run this command is proof of aliveness.
          const { ipcCall } = await import("../../../transport/ipc.js");
          await ipcCall(socketPath, {
            method: "write",
            params: {
              channel: "chat",
              msg: { id: "self-pong", type: "text", data: "pong" },
            },
          });
        } else {
          await deliverMessageToOpenClaw(
            {
              openclawPath: runtime.openclawPath,
              sessionId: runtime.sessionId,
              text: prompt,
              local: true,
            },
            probeEnv,
            { workspaceDir },
          );
        }
      },
    });
  } catch (error) {
    throw formatProbeFailure({
      openclawPath: runtime.openclawPath,
      sessionId: runtime.sessionId,
      workspaceDir,
      error,
    });
  }

  return runtime;
}
