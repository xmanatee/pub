import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatExecFailure } from "../exec-failure.js";

const execFileAsync = promisify(execFile);

function getOpenClawInvocation(openclawPath: string, args: string[]): { cmd: string; args: string[] } {
  if (openclawPath.endsWith(".js")) {
    return { cmd: process.execPath, args: [openclawPath, ...args] };
  }
  return { cmd: openclawPath, args };
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

interface OpenClawDeliverySettings {
  bridgeCwd: string;
  deliver?: boolean;
  deliverChannel?: string;
  deliverTimeoutMs?: number;
}

export async function deliverMessageToOpenClaw(
  params: { openclawPath: string; sessionId: string; text: string },
  env: NodeJS.ProcessEnv = process.env,
  deliverySettings: OpenClawDeliverySettings,
): Promise<void> {
  const parsedTimeoutMs = deliverySettings.deliverTimeoutMs;
  const effectiveTimeoutMs =
    typeof parsedTimeoutMs === "number" && Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0
      ? parsedTimeoutMs
      : 120_000;

  const args = ["agent", "--local", "--session-id", params.sessionId, "-m", params.text];
  const shouldDeliver =
    deliverySettings.deliver === true || Boolean(deliverySettings.deliverChannel);
  if (shouldDeliver) args.push("--deliver");
  const deliverChannel = deliverySettings.deliverChannel?.trim();
  if (deliverChannel) {
    args.push("--channel", deliverChannel);
  }

  const invocation = getOpenClawInvocation(params.openclawPath, args);
  try {
    await execFileAsync(invocation.cmd, invocation.args, {
      cwd: deliverySettings.bridgeCwd,
      timeout: effectiveTimeoutMs,
      env,
    });
  } catch (error) {
    throw formatExecFailure("OpenClaw delivery failed", error);
  }
}
