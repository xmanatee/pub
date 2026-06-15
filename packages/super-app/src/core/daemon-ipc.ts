import { createServerFn } from "@tanstack/react-start";
import type { CommandFunctionSpec, JsonValue } from "~/core/types";

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
    const { DaemonUnavailableError, resolveSocketPath, sendOverSocket } = await import(
      "./daemon-ipc.server"
    );
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
