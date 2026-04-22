/**
 * `pub start` bundles super-app source and extracts it into the user's
 * workspace on first run. The agent's bridge workspace and the tunneled dev
 * server both point at the extracted directory, so the agent can edit files
 * the user is viewing (vite HMR reflects changes through the tunnel).
 *
 * Once initialized, the directory is owned by the user — we never overwrite
 * it. A CLI upgrade reuses the existing workspace; users opt in to a refresh
 * by deleting the directory.
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import SUPER_APP_BUNDLE_PATH from "../../assets/super-app-source.tar.gz" with { type: "file" };
import { DEFAULT_RELAY_URL, type PubTunnelConfig } from "../core/config/types.js";

const DEFAULT_DEV_PORT = 5173;
const SUPER_APP_DIR_NAME = "super-app";

export interface SuperAppWorkspace {
  dir: string;
  tunnelConfig: PubTunnelConfig;
  wasInitialized: boolean;
}

export function ensureSuperAppWorkspace(workspaceRoot: string): SuperAppWorkspace {
  const dir = path.join(workspaceRoot, SUPER_APP_DIR_NAME);
  const tunnelConfig = buildTunnelConfig(dir);
  if (isSuperAppInitialized(dir)) {
    return { dir, tunnelConfig, wasInitialized: false };
  }
  extractSuperAppBundle(SUPER_APP_BUNDLE_PATH, dir);
  const packageManager = detectPackageManager();
  execSync(`${packageManager} install`, { cwd: dir, stdio: "inherit", timeout: 180_000 });
  // Priming build: produces `src/routeTree.gen.ts` (and validates the
  // source tree) so `pub commit`'s typecheck is deterministic from the
  // first invocation, not racing vite dev's background codegen.
  execSync(`${packageManager} run build`, { cwd: dir, stdio: "inherit", timeout: 120_000 });
  return { dir, tunnelConfig, wasInitialized: true };
}

export function getSuperAppDir(saved: PubTunnelConfig | undefined, workspaceRoot: string): string {
  if (saved?.devCommand && saved.devCwd) return saved.devCwd;
  return path.join(workspaceRoot, SUPER_APP_DIR_NAME);
}

export function buildTunnelConfig(dir: string): PubTunnelConfig {
  return {
    devCommand: "./node_modules/.bin/vite dev --host 127.0.0.1 --strictPort",
    devCwd: dir,
    devPort: DEFAULT_DEV_PORT,
    relayUrl: DEFAULT_RELAY_URL,
  };
}

export function isSuperAppInitialized(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, "node_modules"))
  );
}

export function extractSuperAppBundle(bundlePath: string, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  // Compiled binaries embed the tarball in a virtual FS that `tar` can't
  // read directly. Read bytes ourselves and pipe to `tar -xzf -`.
  const bytes = fs.readFileSync(bundlePath);
  execSync(`tar -xzf - -C "${dir}"`, {
    input: bytes,
    stdio: ["pipe", "inherit", "inherit"],
    timeout: 30_000,
  });
}

export function detectPackageManager(): string {
  for (const pm of ["pnpm", "npm"]) {
    try {
      execSync(`${pm} --version`, { stdio: "ignore", timeout: 5_000 });
      return pm;
    } catch {}
  }
  throw new Error("No package manager found. Install pnpm or npm to initialize super-app.");
}
