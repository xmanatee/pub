import type { JsonValue } from "./types";

function joinPath(...segments: string[]): string {
  const [first = "", ...rest] = segments;
  const joined = [
    first.replace(/\/+$/, ""),
    ...rest.map((segment) => segment.replace(/^\/+|\/+$/g, "")),
  ]
    .filter((segment) => segment.length > 0)
    .join("/");
  return first.startsWith("/") ? `/${joined}`.replace(/^\/+/, "/") : joined;
}

export function resolveSocketPath(): string {
  const override = process.env.PUB_AGENT_SOCKET?.trim();
  if (override) return override;
  const pubHome = process.env.PUB_HOME?.trim();
  if (pubHome) return joinPath(pubHome, "sockets", "daemon.sock");
  const xdgRuntime = process.env.XDG_RUNTIME_DIR?.trim();
  if (xdgRuntime) return joinPath(xdgRuntime, "pub", "sockets", "daemon.sock");
  const home = process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || ".";
  const stateBase = process.env.XDG_STATE_HOME?.trim() || joinPath(home, ".local", "state");
  return joinPath(stateBase, "pub", "runtime-host", "pub", "sockets", "daemon.sock");
}

export class DaemonUnavailableError extends Error {}

export async function sendOverSocket(
  socketPath: string,
  request: unknown,
): Promise<{
  ok: boolean;
  value?: JsonValue;
  error?: string;
}> {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath);
    let buffer = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      conn.destroy();
      fn();
    };
    conn.on("connect", () => {
      conn.write(`${JSON.stringify(request)}\n`);
    });
    conn.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      try {
        finish(() => resolve(JSON.parse(buffer.slice(0, newline))));
      } catch (err) {
        finish(() => reject(err));
      }
    });
    conn.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ECONNREFUSED") {
        finish(() => reject(new DaemonUnavailableError()));
      } else {
        finish(() => reject(err));
      }
    });
    conn.on("close", () => {
      finish(() => reject(new Error("daemon closed connection without response")));
    });
  });
}
