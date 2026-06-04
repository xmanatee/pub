import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatExecFailure } from "../exec-failure.js";

const execFileAsync = promisify(execFile);

const DELIVER_TIMEOUT_MS = 120_000;

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

export async function deliverMessageToCommand(
  params: { command: string; text: string },
  env: NodeJS.ProcessEnv = process.env,
  settings: DeliverySettings,
): Promise<string> {
  try {
    const result = await execFileAsync(params.command, [params.text], {
      cwd: settings.workspaceDir,
      timeout: DELIVER_TIMEOUT_MS,
      env: buildOpenClawLikeCommandEnv(env),
    });
    return result.stdout.trim();
  } catch (error) {
    throw formatExecFailure("openclaw-like delivery failed", error);
  }
}
