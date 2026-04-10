import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const REPO = "xmanatee/pub";
const RELEASES_PER_PAGE = 100;
const MAX_RELEASE_PAGES = 10;

interface LatestRelease {
  tag: string;
  version: string;
}

export function resolveTarget(platform: NodeJS.Platform, arch: string): string {
  let normalizedPlatform: "darwin" | "linux";
  switch (platform) {
    case "darwin":
      normalizedPlatform = "darwin";
      break;
    case "linux":
      normalizedPlatform = "linux";
      break;
    default:
      throw new Error(`Unsupported platform for binary upgrade: ${platform}`);
  }

  let normalizedArch: "arm64" | "x64";
  switch (arch) {
    case "arm64":
      normalizedArch = "arm64";
      break;
    case "x64":
      normalizedArch = "x64";
      break;
    default:
      throw new Error(`Unsupported architecture for binary upgrade: ${arch}`);
  }

  return `${normalizedPlatform}-${normalizedArch}`;
}

export function detectTarget(): string {
  return resolveTarget(process.platform, process.arch);
}

export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

export function versionFromTag(tag: string): string {
  if (!tag.startsWith("cli-v")) {
    throw new Error(`Invalid CLI release tag: ${tag}`);
  }
  return tag.replace("cli-v", "");
}

function validateDownloadedBinary(binaryPath: string, expectedVersion: string): void {
  let output: string;
  try {
    output = execFileSync(binaryPath, ["--version"], {
      encoding: "utf-8",
      env: {
        ...process.env,
        PUB_SKIP_UPDATE_CHECK: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(
      `Downloaded binary failed validation: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const reportedVersion = output.trim();
  if (reportedVersion !== expectedVersion) {
    throw new Error(
      `Downloaded binary reported version ${reportedVersion || "(empty)"}; expected ${expectedVersion}.`,
    );
  }
}

function resolveInstalledBinaryPath(execPath = process.execPath): string {
  const executableName = path.basename(execPath);
  if (!executableName.startsWith("pub")) {
    throw new Error(
      `Self-update is only supported for installed pub binaries. Current executable: ${execPath}`,
    );
  }
  return execPath;
}

export async function fetchLatestRelease(fetchImpl: typeof fetch = fetch): Promise<LatestRelease> {
  let best: LatestRelease | null = null;

  for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
    const res = await fetchImpl(
      `https://api.github.com/repos/${REPO}/releases?per_page=${RELEASES_PER_PAGE}&page=${page}`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}: ${res.statusText}`);
    }

    const releases = (await res.json()) as { tag_name: string }[];
    if (releases.length === 0) break;

    for (const release of releases) {
      if (!release.tag_name.startsWith("cli-v")) continue;
      const version = versionFromTag(release.tag_name);
      if (!best || isNewer(version, best.version)) {
        best = { tag: release.tag_name, version };
      }
    }

    if (best) return best;
  }

  throw new Error("No cli-v* release found");
}

export function binaryDownloadUrl(tag: string, target: string): string {
  return `https://github.com/${REPO}/releases/download/${tag}/pub-${target}`;
}

export async function downloadAndReplace(tag: string, target: string): Promise<void> {
  const url = binaryDownloadUrl(tag, target);
  const execPath = resolveInstalledBinaryPath();
  const expectedVersion = versionFromTag(tag);
  const tmpPath = path.join(path.dirname(execPath), `.pub-update-${process.pid}`);
  const backupPath = path.join(path.dirname(execPath), `.pub-backup-${process.pid}`);

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
  }
  if (!res.body) {
    throw new Error("Empty response body");
  }

  const out = fs.createWriteStream(tmpPath, { mode: 0o755 });
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), out);
  validateDownloadedBinary(tmpPath, expectedVersion);

  try {
    fs.rmSync(backupPath, { force: true });
    fs.renameSync(execPath, backupPath);
    fs.renameSync(tmpPath, execPath);
    fs.rmSync(backupPath, { force: true });
  } catch (error) {
    try {
      if (!fs.existsSync(execPath) && fs.existsSync(backupPath)) {
        fs.renameSync(backupPath, execPath);
      }
    } catch (restoreError) {
      const updateError = error instanceof Error ? error.message : String(error);
      const rollbackError =
        restoreError instanceof Error ? restoreError.message : String(restoreError);
      throw new Error(`Update failed (${updateError}) and rollback failed (${rollbackError})`);
    }
    throw error;
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.rmSync(tmpPath, { force: true });
    }
  }
}
