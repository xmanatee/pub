import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { FsListResult, FsReadResult } from "../results";

const TEXT_PREVIEW_BYTES = 256 * 1024;
const HOME = os.homedir();

function expand(p: string | undefined): string {
  if (!p) return HOME;
  if (p === "~") return HOME;
  if (p.startsWith("~/")) return path.join(HOME, p.slice(2));
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(HOME, p);
}

function tilde(p: string): string {
  if (p === HOME) return "~";
  if (p.startsWith(`${HOME}/`)) return `~/${p.slice(HOME.length + 1)}`;
  return p;
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".yml": "text/yaml",
  ".yaml": "text/yaml",
};

function guessMime(name: string): string {
  return MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

function isLikelyText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  for (const byte of sample) {
    if (byte === 0) return false;
  }
  return true;
}

export async function list(params: { path?: string }): Promise<FsListResult> {
  const cwd = expand(params.path);
  const dirents = await fs.readdir(cwd, { withFileTypes: true });
  const entries = await Promise.all(
    dirents.map(async (e) => {
      const full = path.join(cwd, e.name);
      // lstat — reports the link itself instead of failing on dangling symlinks.
      const s = await fs.lstat(full);
      const type: "file" | "dir" | "symlink" = e.isSymbolicLink()
        ? "symlink"
        : e.isDirectory()
          ? "dir"
          : "file";
      return {
        name: e.name,
        path: tilde(full),
        type,
        size: s.size,
        mtime: s.mtimeMs,
        hidden: e.name.startsWith("."),
      };
    }),
  );
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return {
    cwd: tilde(cwd),
    parent: cwd === "/" ? null : tilde(path.dirname(cwd)),
    entries,
  };
}

export async function read(params: { path: string }): Promise<FsReadResult> {
  const full = expand(params.path);
  const stat = await fs.stat(full);
  const buf = await fs.readFile(full);
  const mime = guessMime(full);
  const looksTextual = isLikelyText(buf);
  if (looksTextual && stat.size <= TEXT_PREVIEW_BYTES) {
    return {
      path: tilde(full),
      size: stat.size,
      mime: mime === "application/octet-stream" ? "text/plain" : mime,
      encoding: "utf8",
      content: buf.toString("utf8"),
      truncated: false,
    };
  }
  if (looksTextual && stat.size > TEXT_PREVIEW_BYTES) {
    return {
      path: tilde(full),
      size: stat.size,
      mime,
      encoding: "utf8",
      content: buf.subarray(0, TEXT_PREVIEW_BYTES).toString("utf8"),
      truncated: true,
    };
  }
  return {
    path: tilde(full),
    size: stat.size,
    mime,
    encoding: "base64",
    content: buf.toString("base64"),
    truncated: false,
  };
}

export async function write(params: {
  path: string;
  content: string;
  encoding?: "utf8" | "base64";
}): Promise<{ path: string }> {
  const full = expand(params.path);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const data =
    params.encoding === "base64" ? Buffer.from(params.content, "base64") : params.content;
  await fs.writeFile(full, data);
  return { path: tilde(full) };
}

export async function mkdir(params: { path: string }): Promise<{ path: string }> {
  const full = expand(params.path);
  await fs.mkdir(full, { recursive: true });
  return { path: tilde(full) };
}

export async function rm(params: { path: string }): Promise<{ path: string }> {
  const full = expand(params.path);
  await fs.rm(full, { recursive: true, force: true });
  return { path: tilde(full) };
}

export async function rename(params: { from: string; to: string }): Promise<{ path: string }> {
  const fromFull = expand(params.from);
  const toFull = expand(params.to);
  await fs.rename(fromFull, toFull);
  return { path: tilde(toFull) };
}
