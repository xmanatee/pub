import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function formatExecFailure(prefix: string, error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(`${prefix}: ${String(error)}`);
  }
  const withOutput = error as Error & { stderr?: string | Buffer; stdout?: string | Buffer };
  const stderr =
    typeof withOutput.stderr === "string"
      ? withOutput.stderr.trim()
      : Buffer.isBuffer(withOutput.stderr)
        ? withOutput.stderr.toString("utf-8").trim()
        : "";
  const stdout =
    typeof withOutput.stdout === "string"
      ? withOutput.stdout.trim()
      : Buffer.isBuffer(withOutput.stdout)
        ? withOutput.stdout.toString("utf-8").trim()
        : "";
  const detail = stderr || stdout || error.message;
  return new Error(`${prefix}: ${detail}`);
}

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
