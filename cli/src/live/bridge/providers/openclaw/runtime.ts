import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function getOpenClawInvocation(openclawPath: string, args: string[]): { cmd: string; args: string[] } {
  if (openclawPath.endsWith(".js")) {
    return { cmd: process.execPath, args: [openclawPath, ...args] };
  }
  return { cmd: openclawPath, args };
}

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

export async function runOpenClawPreflight(
  openclawPath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const invocation = getOpenClawInvocation(openclawPath, ["agent", "--help"]);
  try {
    await execFileAsync(invocation.cmd, invocation.args, {
      timeout: 10_000,
      env,
    });
  } catch (error) {
    throw formatExecFailure("OpenClaw preflight failed", error);
  }
}

const OPENCLAW_DELIVER_TIMEOUT_MS = 120_000;

interface OpenClawDeliverySettings {
  bridgeCwd: string;
}

export async function deliverMessageToOpenClaw(
  params: { openclawPath: string; sessionId: string; text: string },
  env: NodeJS.ProcessEnv = process.env,
  deliverySettings: OpenClawDeliverySettings,
): Promise<void> {
  const args = ["agent", "--local", "--session-id", params.sessionId, "-m", params.text];

  const invocation = getOpenClawInvocation(params.openclawPath, args);
  try {
    await execFileAsync(invocation.cmd, invocation.args, {
      cwd: deliverySettings.bridgeCwd,
      timeout: OPENCLAW_DELIVER_TIMEOUT_MS,
      env,
    });
  } catch (error) {
    throw formatExecFailure("OpenClaw delivery failed", error);
  }
}
