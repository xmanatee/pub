import * as fs from "node:fs";
import * as path from "node:path";
import { errorMessage } from "../../core/errors/cli-error.js";
import { resolvePubPaths } from "../../core/paths.js";

function ensureDir(dirPath: string): string {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  return dirPath;
}

function sanitizeSegment(value: string): string {
  const trimmed = value.trim();
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "session";
}

function relativeFilePaths(rootDir: string, currentDir = rootDir): string[] {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...relativeFilePaths(rootDir, absolutePath));
      continue;
    }
    results.push(path.relative(rootDir, absolutePath));
  }
  return results.sort();
}

function clearDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    return;
  }
  for (const entry of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
  }
}

function writeFilesToDirectory(rootDir: string, files: Record<string, string>): void {
  clearDirectory(rootDir);
  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(targetPath, content, "utf-8");
  }
}

function copyDirectoryContents(sourceDir: string, targetDir: string): void {
  clearDirectory(targetDir);
  if (!fs.existsSync(sourceDir)) return;
  for (const relativePath of relativeFilePaths(sourceDir)) {
    const sourcePath = path.join(sourceDir, relativePath);
    const targetPath = path.join(targetDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

export function latestCliVersionPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolvePubPaths(env).runtimeRoot, "latest-cli-version.txt");
}

export function readLatestCliVersion(versionPath = latestCliVersionPath()): string | null {
  try {
    const raw = fs.readFileSync(versionPath, "utf-8").trim();
    return raw.length > 0 ? raw : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Failed to read CLI version file at ${versionPath}: ${errorMessage(error)}`);
  }
}

export function writeLatestCliVersion(
  version: string,
  versionPath = latestCliVersionPath(),
): void {
  ensureDir(path.dirname(versionPath));
  fs.writeFileSync(versionPath, `${version.trim()}\n`, { mode: 0o600 });
}

export function liveInfoDir(env: NodeJS.ProcessEnv = process.env): string {
  return ensureDir(path.join(resolvePubPaths(env).daemonRoot, "info"));
}

export function liveInfoPath(daemonId: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(liveInfoDir(env), `${sanitizeSegment(daemonId)}.json`);
}

export function liveLogDir(env: NodeJS.ProcessEnv = process.env): string {
  return ensureDir(resolvePubPaths(env).daemonLogRoot);
}

export function liveLogPath(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(liveLogDir(env), `${sanitizeSegment(name)}.log`);
}

export function pubCanvasDir(pubId: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolvePubPaths(env).canvasRoot, "pubs", sanitizeSegment(pubId), "files");
}

export function liveWorkspaceSessionDir(
  liveSessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolvePubPaths(env).workspaceRoot, "sessions", sanitizeSegment(liveSessionId));
}

export function liveWorkspaceCanvasDir(
  liveSessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(liveWorkspaceSessionDir(liveSessionId, env), "canvas");
}

export function liveRuntimeSessionDir(
  liveSessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolvePubPaths(env).sessionRuntimeRoot, sanitizeSegment(liveSessionId));
}

export function liveRuntimeSessionAttachmentsDir(
  liveSessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(liveRuntimeSessionDir(liveSessionId, env), "attachments");
}

export function liveRuntimeSessionArtifactsDir(
  liveSessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(liveRuntimeSessionDir(liveSessionId, env), "artifacts");
}

export function ensureLiveSessionDirs(params: {
  liveSessionId: string;
  pubId: string;
  env?: NodeJS.ProcessEnv;
}) {
  const env = params.env ?? process.env;
  const workspaceCanvasDir = ensureDir(liveWorkspaceCanvasDir(params.liveSessionId, env));
  const attachmentDir = ensureDir(liveRuntimeSessionAttachmentsDir(params.liveSessionId, env));
  const artifactsDir = ensureDir(liveRuntimeSessionArtifactsDir(params.liveSessionId, env));
  const canvasDir = ensureDir(pubCanvasDir(params.pubId, env));
  return {
    liveSessionId: sanitizeSegment(params.liveSessionId),
    pubId: sanitizeSegment(params.pubId),
    workspaceCanvasDir,
    attachmentDir,
    artifactsDir,
    pubCanvasDir: canvasDir,
  };
}

export function writeCanvasMirror(pubId: string, files: Record<string, string>): string {
  const targetDir = pubCanvasDir(pubId);
  writeFilesToDirectory(targetDir, files);
  return targetDir;
}

export function hydrateSessionWorkspace(params: {
  liveSessionId: string;
  pubId: string;
  files: Record<string, string>;
  env?: NodeJS.ProcessEnv;
}) {
  const sessionDirs = ensureLiveSessionDirs(params);
  writeFilesToDirectory(sessionDirs.pubCanvasDir, params.files);
  copyDirectoryContents(sessionDirs.pubCanvasDir, sessionDirs.workspaceCanvasDir);
  return sessionDirs;
}

export function readWorkspaceFiles(workspaceCanvasDir: string): Record<string, string> {
  if (!fs.existsSync(workspaceCanvasDir)) return {};
  const files: Record<string, string> = {};
  for (const relativePath of relativeFilePaths(workspaceCanvasDir)) {
    files[relativePath] = fs.readFileSync(path.join(workspaceCanvasDir, relativePath), "utf-8");
  }
  return files;
}

export function applyWorkspaceFiles(
  workspaceCanvasDir: string,
  files: Record<string, string>,
): Record<string, string> {
  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = path.join(workspaceCanvasDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(targetPath, content, "utf-8");
  }
  return readWorkspaceFiles(workspaceCanvasDir);
}

export function readLogTail(logPath: string, maxChars = 16_000): string | null {
  try {
    const raw = fs.readFileSync(logPath, "utf-8");
    return raw.length > maxChars ? raw.slice(-maxChars) : raw;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Failed to read daemon log at ${logPath}: ${errorMessage(error)}`);
  }
}

export function removeLiveSessionDirs(
  liveSessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  fs.rmSync(liveWorkspaceSessionDir(liveSessionId, env), { recursive: true, force: true });
  fs.rmSync(liveRuntimeSessionDir(liveSessionId, env), { recursive: true, force: true });
}
