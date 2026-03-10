/**
 * IPC client — connects to the agent daemon's Unix socket.
 *
 * Sends JSON requests, receives JSON responses.
 */

import * as net from "node:net";
import { type IpcRequest, type IpcResponseFor, parseIpcResponse } from "./ipc-protocol.js";

export function getAgentSocketPath(): string {
  const override = process.env.PUB_AGENT_SOCKET?.trim();
  if (override && override.length > 0) return override;
  return "/tmp/pub-agent.sock";
}

export async function ipcCall<T extends IpcRequest["method"]>(
  socketPath: string,
  request: Extract<IpcRequest, { method: T }>,
): Promise<IpcResponseFor<T>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      fn();
    };

    const client = net.createConnection(socketPath, () => {
      client.write(`${JSON.stringify(request)}\n`);
    });

    let data = "";
    client.on("data", (chunk) => {
      data += chunk.toString();
      const newlineIdx = data.indexOf("\n");
      if (newlineIdx !== -1) {
        const line = data.slice(0, newlineIdx);
        client.end();
        try {
          const parsed = parseIpcResponse(request.method, JSON.parse(line));
          if (!parsed) {
            finish(() => reject(new Error("Invalid response from daemon")));
            return;
          }
          finish(() => resolve(parsed));
        } catch {
          finish(() => reject(new Error("Invalid response from daemon")));
        }
      }
    });

    client.on("error", (err) => {
      if (
        (err as NodeJS.ErrnoException).code === "ECONNREFUSED" ||
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        finish(() => reject(new Error("Daemon not running.")));
      } else {
        finish(() => reject(err));
      }
    });

    client.on("end", () => {
      if (!data.includes("\n")) {
        finish(() => reject(new Error("Daemon closed connection unexpectedly")));
      }
    });

    timeoutId = setTimeout(() => {
      client.destroy();
      finish(() => reject(new Error("Daemon request timed out")));
    }, 10_000);
  });
}
