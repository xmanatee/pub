import { readStringValue } from "~/core/json-boundary";
import { invoke } from "~/core/pub";
import type { CommandFunctionSpec } from "~/core/types";

export function formatAIError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("AGENT_PROVIDER_UNAVAILABLE")) {
    return "Local agent commands are not available in the running Pub daemon. Restart Pub after upgrading the CLI.";
  }
  if (message.includes("AGENT_DETACHED_UNSUPPORTED")) {
    return "This agent runtime cannot run detached app commands. Use the Codex bridge or configure a supported provider.";
  }
  return message;
}

export function runAI(spec: CommandFunctionSpec, args: Record<string, unknown>): Promise<string>;
export function runAI<T>(
  spec: CommandFunctionSpec,
  args: Record<string, unknown>,
  parse: (value: unknown) => T,
): Promise<T>;
export async function runAI<T>(
  spec: CommandFunctionSpec,
  args: Record<string, unknown>,
  parse?: (value: unknown) => T,
): Promise<T | string> {
  const value = await invoke(spec, args);
  if (parse) return parse(value);
  return readStringValue(value, spec.name);
}
