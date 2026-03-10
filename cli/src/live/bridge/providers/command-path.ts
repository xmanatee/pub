import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

interface ResolveCommandFromPathOptions {
  timeoutMs?: number;
  requireExistingPath?: boolean;
}

export function resolveCommandFromPath(
  command: string,
  options: ResolveCommandFromPathOptions = {},
): string | null {
  const result = spawnSync("which", [command], {
    encoding: "utf-8",
    timeout: options.timeoutMs ?? 5_000,
  });

  if (result.error || result.status !== 0) return null;

  const resolved = result.stdout.trim();
  if (resolved.length === 0) return null;

  if ((options.requireExistingPath ?? true) && !existsSync(resolved)) return null;
  return resolved;
}
