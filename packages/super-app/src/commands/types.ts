/**
 * Command system — declarative catalog the agent (or a human) edits to add,
 * remove, or change capabilities of the super-app at runtime.
 *
 * A command spec describes HOW to fulfill a named operation. The dispatcher
 * picks an executor based on the spec's `kind` and runs it with the caller's
 * params. Adding a new command = add an entry to `manifest.ts`.
 *
 * Three executor kinds:
 *   exec    — spawn a process; parse stdout
 *   fetch   — HTTP request; parse response
 *   handler — call a TS function from `commands/handlers/<id>.ts`
 *
 * Args support `{{param}}` template substitution from invocation params.
 */

export type Parse = "json" | "text" | "buffer" | "void";

export interface ExecSpec {
  kind: "exec";
  command: string;
  /** Argv. Strings may include `{{param}}` placeholders. */
  args?: string[];
  /** Body to write to stdin (template-substituted). */
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  parse?: Parse;
  timeoutMs?: number;
}

export interface FetchSpec {
  kind: "fetch";
  /** URL with `{{param}}` placeholders. */
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  /** Body string with template substitutions, OR a function id. */
  body?: string;
  parse?: Parse;
  timeoutMs?: number;
}

export interface HandlerSpec {
  kind: "handler";
  /** Module id under `commands/handlers/`, e.g. `"fs"`. */
  module: string;
  /** Exported function name from that module. */
  fn: string;
  timeoutMs?: number;
}

export type CommandSpec = ExecSpec | FetchSpec | HandlerSpec;

export interface CommandError {
  code: string;
  message: string;
  details?: unknown;
}

export type CommandResponse<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: CommandError };
