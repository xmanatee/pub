import * as fs from "node:fs";
import { errorMessage } from "../../core/errors/cli-error.js";
import { DaemonUnavailableError, ipcCall } from "../transport/ipc.js";

interface PrepareDaemonSocketForListenParams {
  socketPath: string;
  debugLog: (message: string, error?: unknown) => void;
}

export async function prepareDaemonSocketForListen({
  socketPath,
  debugLog,
}: PrepareDaemonSocketForListenParams): Promise<void> {
  if (!fs.existsSync(socketPath)) return;

  let status: Awaited<ReturnType<typeof ipcCall<"status">>> | null = null;
  try {
    status = await ipcCall(socketPath, { method: "status", params: {} });
  } catch (error) {
    if (!(error instanceof DaemonUnavailableError)) {
      throw new Error(`Failed to inspect daemon socket ${socketPath}: ${errorMessage(error)}`);
    }
    debugLog("stale daemon socket is unavailable; removing it", error);
  }

  if (status) {
    if (status.ok) {
      throw new Error(`Daemon already running (socket: ${socketPath})`);
    }
    throw new Error(`Daemon socket returned an invalid status response (socket: ${socketPath})`);
  }

  try {
    fs.unlinkSync(socketPath);
  } catch (error) {
    debugLog("failed to remove stale daemon socket", error);
    throw new Error(`Failed to remove stale daemon socket ${socketPath}: ${errorMessage(error)}`);
  }
}
