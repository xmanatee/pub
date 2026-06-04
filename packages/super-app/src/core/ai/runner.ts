import { readStringValue } from "~/core/json-boundary";
import { invoke } from "~/core/pub";
import type { CommandFunctionSpec } from "~/core/types";

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
