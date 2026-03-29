import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatExecFailure } from "../exec-failure.js";

const execFileAsync = promisify(execFile);

const DELIVER_TIMEOUT_MS = 120_000;

interface DeliverySettings {
  workspaceDir: string;
}

export async function deliverMessageToCommand(
  params: { command: string; text: string },
  env: NodeJS.ProcessEnv = process.env,
  settings: DeliverySettings,
): Promise<void> {
  try {
    await execFileAsync(params.command, [params.text], {
      cwd: settings.workspaceDir,
      timeout: DELIVER_TIMEOUT_MS,
      env,
    });
  } catch (error) {
    throw formatExecFailure("openclaw-like delivery failed", error);
  }
}
