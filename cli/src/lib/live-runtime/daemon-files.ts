import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

export function liveInfoDir(): string {
  const dir = path.join(homedir(), ".config", "pubblue", "lives");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function liveInfoPath(slug: string): string {
  return path.join(liveInfoDir(), `${slug}.json`);
}

export function liveLogPath(slug: string): string {
  return path.join(liveInfoDir(), `${slug}.log`);
}

export function latestCliVersionPath(): string {
  return path.join(liveInfoDir(), "cli-version.txt");
}

export function readLatestCliVersion(versionPath?: string): string | null {
  const resolved = versionPath || latestCliVersionPath();
  try {
    const value = fs.readFileSync(resolved, "utf-8").trim();
    return value.length === 0 ? null : value;
  } catch {
    return null;
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
  } catch {
    return null;
  }
}
