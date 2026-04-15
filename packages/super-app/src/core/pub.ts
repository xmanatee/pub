/**
 * Super-app command client + generic async state hook. `invoke` forwards a
 * `CommandFunctionSpec` to the pub daemon via a TanStack Start server fn;
 * `useAsync` drives loading/error/loaded state for any promise-returning fn.
 */
import * as React from "react";
import { runCommandSpec } from "./daemon-ipc";
import type { CommandFunctionSpec } from "./types";

interface InvokeInit {
  signal?: AbortSignal;
  requestedTimeoutMs?: number;
}

export async function invoke<T = unknown>(
  spec: CommandFunctionSpec,
  args: Record<string, unknown> = {},
  init: InvokeInit = {},
): Promise<T> {
  const response = await runCommandSpec({
    data: { spec, args, requestedTimeoutMs: init.requestedTimeoutMs },
    signal: init.signal,
  });
  if (!response.ok) throw new Error(response.error);
  return response.value as T;
}

/** Wrap a promise-returning action; surface failures via `alert`. */
export async function withErrorAlert(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
    return false;
  }
}

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "loaded"; value: T };

export interface AsyncResult<T> {
  state: AsyncState<T>;
  reload: () => void;
}

/** Drive loading / error / loaded state for a promise-returning factory. */
export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList): AsyncResult<T> {
  const [state, setState] = React.useState<AsyncState<T>>({ status: "loading" });
  const [tick, setTick] = React.useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: caller-owned deps
  React.useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fn()
      .then((value) => {
        if (alive) setState({ status: "loaded", value });
      })
      .catch((err) => {
        if (alive)
          setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, [tick, ...deps]);

  const reload = React.useCallback(() => setTick((t) => t + 1), []);
  return { state, reload };
}
