import { realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const PUB_FS_SESSION_PATH_PREFIX = "/./";

type PubFsPathScope = "session";

function canonicalizePath(pathValue: string): string {
  try {
    return realpathSync(pathValue);
  } catch {
    return resolve(pathValue);
  }
}

function assertPathWithinRoot(targetPath: string, rootDir: string, label: string): void {
  const normalizedRoot = canonicalizePath(rootDir);
  const normalizedTarget = canonicalizePath(targetPath);
  const rel = relative(normalizedRoot, normalizedTarget);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return;
  }
  throw new Error(`${label} escapes the active pub workspace.`);
}

export function resolvePubFsRequestPath(
  rawPath: string,
  sessionRootDir: string | null,
): { path: string; scope: PubFsPathScope } {
  if (!rawPath.startsWith(PUB_FS_SESSION_PATH_PREFIX)) {
    throw new Error(
      `Pub FS paths must stay inside the active session workspace and start with "${PUB_FS_SESSION_PATH_PREFIX}".`,
    );
  }

  if (!sessionRootDir) {
    throw new Error("No active pub workspace is available for session-relative pub-fs paths.");
  }

  const sessionRoot = canonicalizePath(sessionRootDir);
  const resolvedPath = resolve(sessionRoot, rawPath.slice(PUB_FS_SESSION_PATH_PREFIX.length));
  assertPathWithinRoot(resolvedPath, sessionRoot, "Requested path");
  return { path: resolvedPath, scope: "session" };
}

export function resolveExistingPubFsPath(
  rawPath: string,
  sessionRootDir: string | null,
): string {
  const resolved = resolvePubFsRequestPath(rawPath, sessionRootDir);
  const realPath = realpathSync(resolved.path);
  assertPathWithinRoot(realPath, sessionRootDir!, "Resolved file path");
  return realPath;
}

export function assertPubFsWriteParent(
  resolvedPath: string,
  scope: PubFsPathScope,
  sessionRootDir: string | null,
): void {
  if (!sessionRootDir) {
    throw new Error("No active pub workspace is available for session-relative pub-fs paths.");
  }
  const realParent = realpathSync(dirname(resolvedPath));
  assertPathWithinRoot(realParent, sessionRootDir, "Resolved parent path");
}
