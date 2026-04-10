import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { failCli } from "../errors/cli-error.js";
import {
  EXCLUDED_DIRS,
  EXCLUDED_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_FILES_PER_PUB,
  MAX_TOTAL_PUB_SIZE,
  SYSTEM_FILE_PREFIX,
} from "./constants.js";

function isExcludedDir(name: string): boolean {
  return name.startsWith(".") || EXCLUDED_DIRS.has(name);
}

function isExcludedFile(name: string): boolean {
  if (name.startsWith(".")) return true;
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return EXCLUDED_EXTENSIONS.has(name.slice(dot));
}

function collectFiles(dir: string, rootDir: string, result: Map<string, string>): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (isExcludedDir(entry.name)) continue;
      collectFiles(join(dir, entry.name), rootDir, result);
    } else if (entry.isFile()) {
      if (isExcludedFile(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      const relPath = relative(rootDir, fullPath).split("\\").join("/");
      result.set(relPath, fullPath);
    }
  }
}

export function readDirectory(dirPath: string): Record<string, string> {
  const stat = statSync(dirPath, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) {
    failCli(`Not a directory: ${dirPath}`);
  }

  const pathMap = new Map<string, string>();
  collectFiles(dirPath, dirPath, pathMap);

  if (!pathMap.has("index.html")) {
    failCli("Directory must contain an index.html file.");
  }
  if (pathMap.size > MAX_FILES_PER_PUB) {
    failCli(`Too many files (${pathMap.size}, max ${MAX_FILES_PER_PUB}).`);
  }

  const files: Record<string, string> = {};
  let totalSize = 0;

  for (const [relPath, fullPath] of pathMap) {
    if (relPath.startsWith(SYSTEM_FILE_PREFIX)) continue;
    if (relPath.includes("..") || relPath.startsWith("/")) {
      failCli(`Invalid file path: ${relPath}`);
    }

    const content = readFileSync(fullPath, "utf-8");
    const size = Buffer.byteLength(content, "utf-8");

    if (size > MAX_FILE_SIZE) {
      failCli(`File ${relPath} exceeds max size (${MAX_FILE_SIZE / 1024}KB).`);
    }
    totalSize += size;
    files[relPath] = content;
  }

  if (totalSize > MAX_TOTAL_PUB_SIZE) {
    failCli(`Total size exceeds max (${(MAX_TOTAL_PUB_SIZE / 1024 / 1024).toFixed(1)}MB).`);
  }

  return files;
}
