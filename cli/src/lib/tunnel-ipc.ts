/**
 * IPC client — connects to the tunnel daemon's Unix socket.
 *
 * Sends JSON-RPC requests, receives JSON responses.
 */

import * as net from "node:net";

export interface IpcRequest {
  method: string;
  params: Record<string, unknown>;
}

export interface IpcResponse {
  ok: boolean;
  messages?: Array<{ channel: string; msg: Record<string, unknown> }>;
  channels?: Array<{ name: string; direction: string }>;
  connected?: boolean;
  uptime?: number;
  error?: string;
  [key: string]: unknown;
}

export function getSocketPath(tunnelId: string): string {
  return `/tmp/pubblue-${tunnelId}.sock`;
}

export async function ipcCall(socketPath: string, request: IpcRequest): Promise<IpcResponse> {
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
          finish(() => resolve(JSON.parse(line) as IpcResponse));
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
        finish(() => reject(new Error("Daemon not running. Is the tunnel still active?")));
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
