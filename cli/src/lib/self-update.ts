import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const REPO = "xmanatee/pub";

export interface LatestRelease {
  tag: string;
  version: string;
}

export function detectTarget(): string {
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${platform}-${arch}`;
}

export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

export async function fetchLatestRelease(): Promise<LatestRelease> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases?per_page=10`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}: ${res.statusText}`);
  }
  const releases = (await res.json()) as { tag_name: string }[];
  const match = releases.find((r) => r.tag_name.startsWith("cli-v"));
  if (!match) {
    throw new Error("No cli-v* release found");
  }
  return { tag: match.tag_name, version: match.tag_name.replace("cli-v", "") };
}

export function binaryDownloadUrl(tag: string, target: string): string {
  return `https://github.com/${REPO}/releases/download/${tag}/pubblue-${target}`;
}

export async function downloadAndReplace(tag: string, target: string): Promise<void> {
  const url = binaryDownloadUrl(tag, target);
  const execPath = process.execPath;
  const tmpPath = path.join(path.dirname(execPath), `.pubblue-update-${process.pid}`);

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
  }
  if (!res.body) {
    throw new Error("Empty response body");
  }

  const out = fs.createWriteStream(tmpPath, { mode: 0o755 });
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), out);

  if (process.platform === "win32") {
    const backupPath = `${execPath}.old`;
    fs.renameSync(execPath, backupPath);
    fs.renameSync(tmpPath, execPath);
    fs.unlinkSync(backupPath);
  } else {
    fs.renameSync(tmpPath, execPath);
  }
}
