import * as fs from "node:fs";
import * as path from "node:path";
import { getConfigDir } from "./config.js";
import { fetchLatestRelease, isNewer } from "./self-update.js";
import { CLI_VERSION } from "./version.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const INLINE_FETCH_TIMEOUT_MS = 3_000;

interface VersionCache {
  version: string;
  tag: string;
  checkedAt: number;
}

function isIgnorableCacheError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string";
}

export interface UpdateCheckResult {
  latest: string;
  tag: string;
  updateAvailable: boolean;
  requiresUpgrade: boolean;
}

function cachePath(): string | null {
  try {
    return path.join(getConfigDir(), "latest-version.json");
  } catch {
    return null;
  }
}

function readCache(): VersionCache | null {
  const cacheFile = cachePath();
  if (!cacheFile) return null;
  try {
    return JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as VersionCache;
  } catch (error) {
    if (!isIgnorableCacheError(error)) throw error;
    return null;
  }
}

function writeCache(cache: VersionCache): void {
  const cacheFile = cachePath();
  if (!cacheFile) return;
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  } catch (error) {
    if (!isIgnorableCacheError(error)) throw error;
  }
}

export function isMinorOrMajorBump(latest: string, current: string): boolean {
  const [lMajor, lMinor] = latest.split(".").map(Number);
  const [cMajor, cMinor] = current.split(".").map(Number);
  return lMajor > cMajor || (lMajor === cMajor && lMinor - cMinor >= 2);
}

function toResult(cache: VersionCache): UpdateCheckResult {
  const updateAvailable = isNewer(cache.version, CLI_VERSION);
  return {
    latest: cache.version,
    tag: cache.tag,
    updateAvailable,
    requiresUpgrade: updateAvailable && isMinorOrMajorBump(cache.version, CLI_VERSION),
  };
}

async function fetchAndCache(): Promise<VersionCache | null> {
  try {
    const release = await Promise.race([
      fetchLatestRelease(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), INLINE_FETCH_TIMEOUT_MS),
      ),
    ]);
    const cache: VersionCache = {
      version: release.version,
      tag: release.tag,
      checkedAt: Date.now(),
    };
    writeCache(cache);
    return cache;
  } catch {
    return null;
  }
}

export async function getUpdateCheck(): Promise<UpdateCheckResult | null> {
  const cache = readCache();

  if (!cache) {
    const fetched = await fetchAndCache();
    return fetched ? toResult(fetched) : null;
  }

  if (Date.now() - cache.checkedAt >= CHECK_INTERVAL_MS) {
    void fetchAndCache();
  }

  return toResult(cache);
}
