/**
 * Client-side command SDK.
 *
 *   const events = await invoke<{ events: CalendarEvent[] }>("calendar.today");
 *   const state  = useCommand<TelegramAuthState>("telegram.auth.state");
 *
 * Every command in `commands/manifest.ts` is reachable. `invoke` throws
 * `CommandError` on failure; `tryInvoke` surfaces failures via `alert`;
 * `useCommand` wraps invocation in a discriminated state machine.
 */
import * as React from "react";
import type { COMMANDS } from "~/commands/manifest";

export type CommandName = keyof typeof COMMANDS;

export class CommandError extends Error {
  constructor(
    public readonly command: string,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

const PREFIX = "_pub/cmd/";

// Base href is fixed for the lifetime of the document (set by Vite at build).
const BASE_HREF = (() => {
  const baseTag = document.querySelector<HTMLBaseElement>("base[href]");
  const base = baseTag?.getAttribute("href") ?? "/";
  return base.endsWith("/") ? base : `${base}/`;
})();

const endpoint = (name: string) => `${BASE_HREF}${PREFIX}${encodeURIComponent(name)}`;

export async function invoke<T = unknown>(
  name: CommandName,
  params: Record<string, unknown> = {},
  init: { signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(endpoint(name), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal: init.signal,
  });
  let body: { ok: boolean; value?: T; error?: { code: string; message: string } };
  try {
    body = await res.json();
  } catch {
    throw new CommandError(name, "BAD_RESPONSE", `${name} returned non-JSON (${res.status})`);
  }
  if (!body.ok) {
    throw new CommandError(
      name,
      body.error?.code ?? "UNKNOWN",
      body.error?.message ?? `command ${name} failed`,
    );
  }
  return body.value as T;
}

/** Invoke a mutating command; surface failures via `alert`. Returns true on success. */
export async function tryInvoke(
  name: CommandName,
  params: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    await invoke(name, params);
    return true;
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
    return false;
  }
}

export type CommandState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; value: T }
  | { status: "error"; error: string };

export function useCommand<T>(
  name: CommandName | null,
  params: Record<string, unknown> = {},
  deps: React.DependencyList = [],
): CommandState<T> & { reload: () => void } {
  const [state, setState] = React.useState<CommandState<T>>(
    name ? { status: "loading" } : { status: "idle" },
  );
  const [tick, setTick] = React.useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit deps array
  React.useEffect(() => {
    if (!name) return;
    const ctrl = new AbortController();
    setState({ status: "loading" });
    invoke<T>(name, params, { signal: ctrl.signal })
      .then((value) => {
        if (ctrl.signal.aborted) return;
        setState({ status: "loaded", value });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      });
    return () => ctrl.abort();
  }, [name, tick, ...deps]);

  const reload = React.useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
