import { existsSync } from "node:fs";
import type {
  BridgeSettings,
  OpenClawLikeBridgeSettings,
  OpenClawLikeProfilesConfig,
  PubBridgeConfig,
} from "../../../../core/config/index.js";
import {
  normalizeOpenClawLikeProfiles,
  parseOpenClawLikeProfilesValue,
  resolveOpenClawLikeDefaultProfile,
} from "../../../../core/config/openclaw-like-profiles.js";
import { runAgentWritePongProbe } from "../../../runtime/bridge-write-probe.js";
import {
  deliverMessageToCommand,
  type OpenClawLikeCommandInvocation,
  resolveOpenClawLikeProfileInvocation,
} from "./runtime.js";

function getStrictOpenClawLikeWorkspaceDir(bridgeConfig: OpenClawLikeBridgeSettings): string {
  return bridgeConfig.workspaceDir;
}

function parseProfilesEnv(raw: string | undefined): OpenClawLikeProfilesConfig | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return parseOpenClawLikeProfilesValue(trimmed, "PUB_OPENCLAW_LIKE_PROFILES");
}

function resolveOpenClawLikeInvocation(
  bridgeConfig?: PubBridgeConfig | BridgeSettings,
  env: NodeJS.ProcessEnv = process.env,
): OpenClawLikeCommandInvocation | undefined {
  const profiles =
    parseProfilesEnv(env.PUB_OPENCLAW_LIKE_PROFILES) ??
    (bridgeConfig?.openclawLikeProfiles
      ? normalizeOpenClawLikeProfiles(bridgeConfig.openclawLikeProfiles)
      : undefined);
  if (!profiles) return undefined;
  const defaultProfile = resolveOpenClawLikeDefaultProfile(
    env.PUB_OPENCLAW_LIKE_DEFAULT_PROFILE ?? bridgeConfig?.openclawLikeDefaultProfile,
    profiles,
  );
  if (!defaultProfile) return undefined;

  return resolveOpenClawLikeProfileInvocation(
    {
      ...(bridgeConfig as OpenClawLikeBridgeSettings),
      mode: "openclaw-like",
      openclawLikeProfiles: profiles,
      openclawLikeDefaultProfile: defaultProfile,
      workspaceDir: resolveOpenClawLikeWorkspaceDir(env),
    },
    defaultProfile,
  );
}

function resolveOpenClawLikeWorkspaceDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.PUB_PROJECT_ROOT?.trim() || process.cwd();
}

function formatOpenClawLikeProbeFailure(params: {
  command: string;
  workspaceDir: string;
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
        `- workspace: ${params.workspaceDir}`,
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
      `- workspace: ${params.workspaceDir}`,
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
): Promise<{ command: string; cwd: string; profileId: string }> {
  const strictConfig = options?.strictConfig === true;
  const invocation =
    strictConfig && bridgeConfig
      ? resolveOpenClawLikeProfileInvocation(bridgeConfig as OpenClawLikeBridgeSettings)
      : resolveOpenClawLikeInvocation(bridgeConfig, env);
  if (!invocation) {
    throw new Error("openclawLike.profiles and openclawLike.defaultProfile are not configured.");
  }
  if (!existsSync(invocation.command)) {
    throw new Error(`openclaw-like command not found on disk: ${invocation.command}`);
  }

  const workspaceDir =
    strictConfig && bridgeConfig
      ? getStrictOpenClawLikeWorkspaceDir(bridgeConfig as OpenClawLikeBridgeSettings)
      : resolveOpenClawLikeWorkspaceDir(env);

  try {
    await runAgentWritePongProbe({
      label: "openclaw-like",
      baseEnv: env,
      execute: async (probeEnv, _signal) => {
        const socketPath = probeEnv.PUB_AGENT_SOCKET ?? "";
        await deliverMessageToCommand(
          {
            command: invocation.command,
            args: invocation.args,
            text: [
              "[pub preflight] Connectivity probe.",
              "Run this exact command now:",
              `PUB_AGENT_SOCKET=${socketPath} pub write "pong"`,
              "Do not explain. Just execute it.",
            ].join("\n"),
          },
          probeEnv,
          { workspaceDir },
        );
      },
    });
  } catch (error) {
    throw formatOpenClawLikeProbeFailure({
      command: invocation.command,
      workspaceDir,
      error,
    });
  }

  return { command: invocation.command, cwd: workspaceDir, profileId: invocation.profileId };
}
