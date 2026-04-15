import { isAbsolute, join, normalize, relative } from "node:path";
import type { BridgeSettings } from "../../core/config/index.js";
import { interpolateTemplate } from "./template.js";

/**
 * Resolve an executor's `cwd` against the active pub workspace. Rejects
 * absolute paths and any path that escapes the workspace root. Returns the
 * workspace itself when no cwd is provided (or the interpolation is empty).
 */
export function resolveWorkspaceCwd(
  requestedCwd: string | undefined,
  args: Record<string, unknown>,
  bridgeSettings: BridgeSettings,
): string {
  const workspaceDir = bridgeSettings.workspaceDir;
  if (!requestedCwd) return workspaceDir;
  const interpolated = interpolateTemplate(requestedCwd, args).trim();
  if (interpolated.length === 0) return workspaceDir;
  if (isAbsolute(interpolated)) {
    throw new Error("Command executor cwd must be relative to the active pub workspace.");
  }
  const normalizedWorkspace = normalize(workspaceDir);
  const resolved = normalize(join(normalizedWorkspace, interpolated));
  const rel = relative(normalizedWorkspace, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Command executor cwd escapes the active pub workspace.");
  }
  return resolved;
}
