/**
 * Server function that forwards a `CommandFunctionSpec` to the running `pub`
 * daemon via its unix socket. The daemon's `run-command-spec` IPC action runs
 * the spec through the shared exec/shell/agent executors — super-app owns
 * zero execution on the host.
 *
 * Wire format: newline-delimited JSON, one request per line.
 */
import { createServerFn } from "@tanstack/react-start";
import type { CommandFunctionSpec, JsonValue } from "~/core/types";

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

/**
 * Mirrors `resolvePubPaths().socketRoot` in the CLI: the daemon listens on
 * `$XDG_RUNTIME_DIR/pub/sockets/daemon.sock` (falling back to
 * `$XDG_STATE_HOME/pub/runtime-host/pub/sockets/daemon.sock`, or
 * `$HOME/.local/state/pub/runtime-host/pub/sockets/daemon.sock`). Override
 * with `PUB_AGENT_SOCKET`.
 */
function resolveSocketPath(): string {
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

class DaemonUnavailableError extends Error {}

export type CommandResponse = { ok: true; value: JsonValue } | { ok: false; error: string };

export const runCommandSpec = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      spec: CommandFunctionSpec;
      args?: Record<string, unknown>;
      requestedTimeoutMs?: number;
    }) => input,
  )
  .handler(async ({ data }): Promise<CommandResponse> => {
    const request = {
      method: "run-command-spec" as const,
      params: {
        spec: data.spec,
        args: data.args ?? {},
        requestedTimeoutMs: data.requestedTimeoutMs,
      },
    };
    const socketPath = resolveSocketPath();
    try {
      return (await sendOverSocket(socketPath, request)) as CommandResponse;
    } catch (err) {
      if (err instanceof DaemonUnavailableError) {
        return {
          ok: false,
          error: `pub daemon not reachable at ${socketPath}. Run \`pub start\`.`,
        };
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

async function sendOverSocket(
  socketPath: string,
  request: unknown,
): Promise<{
  ok: boolean;
  value?: unknown;
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
