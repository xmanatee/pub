import * as fs from "node:fs";
import * as path from "node:path";
import { errorMessage } from "../../core/errors/cli-error.js";
import { getConfigDir } from "../../core/config/index.js";

export function liveInfoDir(): string {
  const dir = path.join(getConfigDir(), "lives");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function liveInfoPath(slug: string): string {
  return path.join(liveInfoDir(), `${slug}.json`);
}

export function liveLogPath(slug: string): string {
  return path.join(liveInfoDir(), `${slug}.log`);
}

function sanitizeSlugForFilename(slug: string): string {
  const sanitized = slug.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
  return sanitized.length > 0 ? sanitized : "live";
}

export function liveSessionsDir(rootDir?: string): string {
  const dir = path.join(rootDir ?? liveInfoDir(), "sessions");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function liveSessionDir(slug: string, rootDir?: string): string {
  const safeSlug = sanitizeSlugForFilename(slug);
  return path.join(liveSessionsDir(rootDir), safeSlug);
}

export function liveSessionFilesDir(slug: string, rootDir?: string): string {
  return path.join(liveSessionDir(slug, rootDir), "files");
}

export function liveSessionAttachmentsDir(slug: string, rootDir?: string): string {
  return path.join(liveSessionDir(slug, rootDir), "attachments");
}

export function liveSessionContentPath(slug: string, rootDir?: string): string {
  return path.join(liveSessionDir(slug, rootDir), "session-content.html");
}

export function ensureLiveSessionDirs(
  slug: string,
  rootDir?: string,
): {
  attachmentsDir: string;
  contentPath: string;
  filesDir: string;
  sessionDir: string;
} {
  const sessionDir = liveSessionDir(slug, rootDir);
  const filesDir = liveSessionFilesDir(slug, rootDir);
  const attachmentsDir = liveSessionAttachmentsDir(slug, rootDir);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });
  fs.mkdirSync(attachmentsDir, { recursive: true });
  return {
    attachmentsDir,
    contentPath: liveSessionContentPath(slug, rootDir),
    filesDir,
    sessionDir,
  };
}

export function writeLiveSessionContentFile(params: {
  slug: string;
  content: string;
  rootDir?: string;
}): string {
  const sessionPaths = ensureLiveSessionDirs(params.slug, params.rootDir);
  fs.writeFileSync(sessionPaths.contentPath, params.content, "utf-8");
  return sessionPaths.contentPath;
}

export function latestCliVersionPath(): string {
  return path.join(liveInfoDir(), "cli-version.txt");
}

function isMissingPathError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

export function readLatestCliVersion(versionPath?: string): string | null {
  const resolved = versionPath || latestCliVersionPath();
  try {
    const value = fs.readFileSync(resolved, "utf-8").trim();
    return value.length === 0 ? null : value;
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw new Error(`Failed to read CLI version file at ${resolved}: ${errorMessage(error)}`);
  }
}

export function writeLatestCliVersion(version: string, versionPath?: string): void {
  const trimmed = version.trim();
  if (trimmed.length === 0) return;
  const resolved = versionPath || latestCliVersionPath();
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, trimmed, "utf-8");
}

export function readLogTail(logPath: string, maxChars = 4_000): string | null {
  try {
    const content = fs.readFileSync(logPath, "utf-8");
    if (content.length <= maxChars) return content;
    return content.slice(-maxChars);
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw new Error(`Failed to read daemon log at ${logPath}: ${errorMessage(error)}`);
  }
}
