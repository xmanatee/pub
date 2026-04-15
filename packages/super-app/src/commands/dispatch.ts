import { spawn } from "node:child_process";
import { COMMANDS } from "./manifest";
import { fillArgs, fillString } from "./template";
import type {
  CommandResponse,
  CommandSpec,
  ExecSpec,
  FetchSpec,
  HandlerSpec,
  Parse,
} from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface DispatchContext {
  /** Loaded once per process; the dispatcher caches handler modules. */
  loadHandler: (module: string) => Promise<Record<string, unknown>>;
}

export async function dispatch(
  name: string,
  params: Record<string, unknown>,
  ctx: DispatchContext,
): Promise<CommandResponse> {
  const spec: CommandSpec | undefined = (COMMANDS as Record<string, CommandSpec>)[name];
  if (!spec) {
    return { ok: false, error: { code: "UNKNOWN_COMMAND", message: `unknown command: ${name}` } };
  }
  try {
    return { ok: true, value: await runSpec(spec, params, ctx) };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "EXECUTION_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

async function runSpec(
  spec: CommandSpec,
  params: Record<string, unknown>,
  ctx: DispatchContext,
): Promise<unknown> {
  switch (spec.kind) {
    case "exec":
      return runExec(spec, params);
    case "fetch":
      return runFetch(spec, params);
    case "handler":
      return runHandler(spec, params, ctx);
  }
}

function runExec(spec: ExecSpec, params: Record<string, unknown>): Promise<unknown> {
  const args = fillArgs(spec.args, params);
  const stdin = spec.stdin ? fillString(spec.stdin, params) : undefined;
  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, args, {
      cwd: spec.cwd,
      env: spec.env ? { ...process.env, ...spec.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${spec.command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString();
    });
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `${spec.command} exit ${code}: ${stderr.trim() || stdout.trim() || "(no output)"}`,
          ),
        );
        return;
      }
      // Promise.try-style: any throw from parseOutput becomes a rejection.
      Promise.resolve()
        .then(() => resolve(parseText(stdout, spec.parse)))
        .catch(reject);
    });
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

async function runFetch(spec: FetchSpec, params: Record<string, unknown>): Promise<unknown> {
  const url = fillString(spec.url, params);
  const body = spec.body ? fillString(spec.body, params) : undefined;
  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: spec.method ?? (body ? "POST" : "GET"),
      headers: spec.headers,
      body,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status} ${res.statusText}`);
    if (spec.parse === "void") return null;
    if (spec.parse === "buffer") {
      return Buffer.from(await res.arrayBuffer()).toString("base64");
    }
    return parseText(await res.text(), spec.parse);
  } finally {
    clearTimeout(timer);
  }
}

async function runHandler(
  spec: HandlerSpec,
  params: Record<string, unknown>,
  ctx: DispatchContext,
): Promise<unknown> {
  const mod = await ctx.loadHandler(spec.module);
  const fn = mod[spec.fn];
  if (typeof fn !== "function") {
    throw new Error(`handler ${spec.module}.${spec.fn} is not a function`);
  }
  return await (fn as (p: Record<string, unknown>) => unknown)(params);
}

/** Decode a text payload per the spec's `parse` setting. `buffer` is not valid here. */
function parseText(text: string, parse: Parse | undefined): unknown {
  if (parse === "json") return text.trim() === "" ? {} : JSON.parse(text);
  if (parse === "void") return null;
  return text;
}
