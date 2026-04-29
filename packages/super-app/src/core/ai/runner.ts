/**
 * Type-safe wrapper around `invoke` for AI prompts. Features should call
 * `runAI(AI_PROMPTS.summarize, { text })` instead of constructing inline
 * `CommandFunctionSpec` literals.
 */
import { invoke } from "~/core/pub";
import type { CommandFunctionSpec } from "~/core/types";

export async function runAI<T = string>(
  spec: CommandFunctionSpec,
  args: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(spec, args);
}
