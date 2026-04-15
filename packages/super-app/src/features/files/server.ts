/**
 * Node-side handlers for filesystem reads: list with mime-typed preview
 * and read with text/base64 detection. Exposed as TanStack Start server
 * functions (Node-only, callable as RPC).
 */
import { lstat, open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, normalize } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { expandHome } from "~/core/paths";
import type { FsListResult, FsReadResult } from "./commands";

const PREVIEW_CAP_BYTES = 5 * 1024 * 1024;
const TEXT_SNIFF_BYTES = 8192;
const HOME = homedir();

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
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

function expand(p: string | undefined): string {
  if (!p) return HOME;
  return normalize(expandHome(p));
}

function tilde(p: string): string {
  if (p === HOME) return "~";
  if (p.startsWith(`${HOME}/`)) return `~/${p.slice(HOME.length + 1)}`;
  return p;
}

function guessMime(name: string): string {
  return MIME[extname(name).toLowerCase()] ?? "application/octet-stream";
}

export const listFiles = createServerFn({ method: "GET" })
  .inputValidator((input: { path?: string }) => input)
  .handler(async ({ data }): Promise<FsListResult> => {
    const cwd = expand(data.path);
    const dirents = await readdir(cwd, { withFileTypes: true });
    const entries = await Promise.all(
      dirents.map(async (e) => {
        const full = join(cwd, e.name);
        const stat = await lstat(full);
        const type = e.isSymbolicLink() ? "symlink" : e.isDirectory() ? "dir" : "file";
        return {
          name: e.name,
          path: tilde(full),
          type: type as FsListResult["entries"][number]["type"],
          size: stat.size,
          mtime: stat.mtimeMs,
          hidden: e.name.startsWith("."),
        };
      }),
    );
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { cwd: tilde(cwd), parent: cwd === "/" ? null : tilde(dirname(cwd)), entries };
  });

export const readFileContents = createServerFn({ method: "GET" })
  .inputValidator((input: { path: string }) => input)
  .handler(async ({ data }): Promise<FsReadResult> => {
    const full = expand(data.path);
    const stat = await lstat(full);
    const fh = await open(full, "r");
    try {
      const readLen = Math.min(stat.size, PREVIEW_CAP_BYTES);
      const buf = Buffer.alloc(readLen);
      await fh.read(buf, 0, readLen, 0);
      const truncated = stat.size > readLen;
      const sniff = buf.subarray(0, Math.min(readLen, TEXT_SNIFF_BYTES));
      const isText = !sniff.includes(0);
      const guessed = guessMime(full);
      const mime = isText && guessed === "application/octet-stream" ? "text/plain" : guessed;
      return {
        name: basename(full),
        path: tilde(full),
        size: stat.size,
        mime,
        encoding: isText ? "utf8" : "base64",
        content: isText ? buf.toString("utf8") : buf.toString("base64"),
        truncated,
      };
    } finally {
      await fh.close();
    }
  });
