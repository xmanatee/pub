import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  OpenClawLikeBridgeSettings,
  OpenClawLikeProfileConfig,
} from "../../../../core/config/index.js";
import { formatExecFailure } from "../exec-failure.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_OPENCLAW_LIKE_DELIVERY_TIMEOUT_MS = 10 * 60 * 1000;
const DELIVER_MAX_OUTPUT_BYTES = 1024 * 1024;

function isDaemonEnvKey(key: string): boolean {
  return key.startsWith("PUB_DAEMON_");
}

export function buildOpenClawLikeCommandEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const commandEnv: NodeJS.ProcessEnv = { ...env };
  const daemonSocket = commandEnv.PUB_DAEMON_SOCKET?.trim();
  const agentSocket = commandEnv.PUB_AGENT_SOCKET?.trim();

  if (!agentSocket && daemonSocket) {
    commandEnv.PUB_AGENT_SOCKET = daemonSocket;
  }

  for (const key of Object.keys(commandEnv)) {
    if (isDaemonEnvKey(key)) {
      delete commandEnv[key];
    }
  }

  commandEnv.PUB_SKIP_UPDATE_CHECK = "1";
  return commandEnv;
}

interface DeliverySettings {
  workspaceDir: string;
}

export type OpenClawLikeCommandInvocation = {
  profileId: string;
  command: string;
  args: string[];
};

export function resolveOpenClawLikeProfileInvocation(
  bridgeSettings: OpenClawLikeBridgeSettings,
  requestedProfileId?: string | null,
): OpenClawLikeCommandInvocation {
  const profileId = requestedProfileId?.trim() || bridgeSettings.openclawLikeDefaultProfile;
  const profile: OpenClawLikeProfileConfig | undefined =
    bridgeSettings.openclawLikeProfiles[profileId];
  if (!profile) {
    const available = Object.keys(bridgeSettings.openclawLikeProfiles).sort().join(", ");
    throw new Error(
      `Unknown openclaw-like live profile "${profileId}". Available profiles: ${available || "(none)"}.`,
    );
  }
  return {
    profileId,
    command: profile.command,
    args: profile.args ?? [],
  };
}

export async function deliverMessageToCommand(
  params: { command: string; args?: string[]; text: string },
  env: NodeJS.ProcessEnv = process.env,
  settings: DeliverySettings,
  options: { timeoutMs?: number; maxOutputBytes?: number; signal?: AbortSignal } = {},
): Promise<string> {
  try {
    const result = await execFileAsync(params.command, [...(params.args ?? []), params.text], {
      cwd: settings.workspaceDir,
      maxBuffer: options.maxOutputBytes ?? DELIVER_MAX_OUTPUT_BYTES,
      signal: options.signal,
      timeout: options.timeoutMs ?? DEFAULT_OPENCLAW_LIKE_DELIVERY_TIMEOUT_MS,
      env: buildOpenClawLikeCommandEnv(env),
    });
    return result.stdout.trim();
  } catch (error) {
    throw formatExecFailure("openclaw-like delivery failed", error);
  }
}
