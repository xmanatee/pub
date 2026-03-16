import { existsSync } from "node:fs";
import type {
  BridgeSettings,
  OpenClawLikeBridgeSettings,
  PubBridgeConfig,
} from "../../../../core/config/index.js";
import { runAgentWritePongProbe } from "../../../runtime/bridge-write-probe.js";
import { deliverMessageToCommand } from "./runtime.js";

function getStrictOpenClawLikeCommand(bridgeConfig: OpenClawLikeBridgeSettings): string {
  return bridgeConfig.openclawLikeCommand;
}

function getStrictOpenClawLikeBridgeCwd(bridgeConfig: OpenClawLikeBridgeSettings): string {
  return bridgeConfig.bridgeCwd;
}

function resolveOpenClawLikeCommand(
  bridgeConfig?: PubBridgeConfig | BridgeSettings,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env.PUB_OPENCLAW_LIKE_COMMAND?.trim() || bridgeConfig?.openclawLikeCommand?.trim();
}

function resolveOpenClawLikeBridgeCwd(
  bridgeConfig?: PubBridgeConfig | BridgeSettings,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return bridgeConfig?.bridgeCwd?.trim() || env.PUB_PROJECT_ROOT?.trim() || process.cwd();
}

function formatOpenClawLikeProbeFailure(params: {
  command: string;
  bridgeCwd: string;
  error: unknown;
}): Error {
  const detail = params.error instanceof Error ? params.error.message : String(params.error);
  const isTimeout = detail.includes('did not perform `pub write "pong"`');
  if (isTimeout) {
    return new Error(
      [
        'openclaw-like bridge probe failed: the command never wrote back `pub write "pong"`.',
        "",
        "Resolved runtime:",
        `- command: ${params.command}`,
        `- bridge cwd: ${params.bridgeCwd}`,
        "",
        "Possible causes:",
        "- The configured command ignored the prompt or did not execute `pub write`.",
        "- The command was not connected to the expected local environment.",
        "- A wrapper script intercepted or altered the invocation.",
        "",
        "Troubleshooting tips:",
        '- Invoke the configured command manually and verify that `pub write "pong"` works.',
        "- Enable verbose daemon logging with `pub config --set bridge.verbose=true` before retrying.",
      ].join("\n"),
    );
  }

  return new Error(
    [
      "openclaw-like bridge probe failed before the `pong` roundtrip completed.",
      detail,
      "",
      "Resolved runtime:",
      `- command: ${params.command}`,
      `- bridge cwd: ${params.bridgeCwd}`,
      "",
      "Troubleshooting tips:",
      "- Run `pub config` to verify the saved openclaw-like runtime settings.",
      "- Verify that the configured command path is correct and executable.",
      "- Enable verbose daemon logging with `pub config --set bridge.verbose=true` before retrying.",
    ].join("\n"),
  );
}

export async function runOpenClawLikeBridgeStartupProbe(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig | BridgeSettings,
  options?: { strictConfig: boolean },
): Promise<{ command: string; cwd: string }> {
  const strictConfig = options?.strictConfig === true;
  const command =
    strictConfig && bridgeConfig
      ? getStrictOpenClawLikeCommand(bridgeConfig as OpenClawLikeBridgeSettings)
      : resolveOpenClawLikeCommand(bridgeConfig, env);
  if (!command) {
    throw new Error("openclawLike.command is not configured.");
  }
  if (!existsSync(command)) {
    throw new Error(`openclaw-like command not found on disk: ${command}`);
  }

  const bridgeCwd =
    strictConfig && bridgeConfig
      ? getStrictOpenClawLikeBridgeCwd(bridgeConfig as OpenClawLikeBridgeSettings)
      : resolveOpenClawLikeBridgeCwd(bridgeConfig, env);

  try {
    await runAgentWritePongProbe({
      label: "openclaw-like",
      baseEnv: env,
      execute: async (probeEnv, _signal) => {
        const socketPath = probeEnv.PUB_AGENT_SOCKET ?? "";
        await deliverMessageToCommand(
          {
            command,
            text: [
              "[pub preflight] Connectivity probe.",
              "Run this exact command now:",
              `PUB_AGENT_SOCKET=${socketPath} pub write \"pong\"`,
              "Do not explain. Just execute it.",
            ].join("\n"),
          },
          probeEnv,
          { bridgeCwd },
        );
      },
    });
  } catch (error) {
    throw formatOpenClawLikeProbeFailure({ command, bridgeCwd, error });
  }

  return { command, cwd: bridgeCwd };
}
