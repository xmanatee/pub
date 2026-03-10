import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatExecFailure } from "../exec-failure.js";

const execFileAsync = promisify(execFile);

interface DeliverySettings {
  bridgeCwd: string;
  deliverTimeoutMs?: number;
}

export async function deliverMessageToCommand(
  params: { command: string; text: string },
  env: NodeJS.ProcessEnv = process.env,
  settings: DeliverySettings,
): Promise<void> {
  const parsedTimeoutMs = settings.deliverTimeoutMs;
  const effectiveTimeoutMs =
    typeof parsedTimeoutMs === "number" && Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0
      ? parsedTimeoutMs
      : 120_000;

  try {
    await execFileAsync(params.command, [params.text], {
      cwd: settings.bridgeCwd,
      timeout: effectiveTimeoutMs,
      env,
    });
  } catch (error) {
    throw formatExecFailure("openclaw-like delivery failed", error);
  }
}
