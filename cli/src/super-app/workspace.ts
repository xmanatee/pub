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
import { execSync, spawnSync } from "node:child_process";
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
  if (fs.existsSync(path.join(dir, "package.json"))) {
    installSuperAppDependencies(dir);
    return { dir, tunnelConfig, wasInitialized: true };
  }
  assertCanExtractSuperApp(dir);
  extractSuperAppBundle(SUPER_APP_BUNDLE_PATH, dir);
  installSuperAppDependencies(dir);
  return { dir, tunnelConfig, wasInitialized: true };
}

function installSuperAppDependencies(dir: string): void {
  // The bundled tarball ships a pnpm-lock.yaml; installing without pnpm
  // would ignore it and resolve to latest, which is how the 1.168.0
  // @tanstack/start-plugin-core regression broke every fresh install.
  assertPnpmAvailable();
  execSync("pnpm install --frozen-lockfile --ignore-workspace", {
    cwd: dir,
    stdio: "inherit",
    timeout: 180_000,
  });
  // Prime generated files once so the first `pub commit` doesn't race
  // dev-server codegen.
  execSync("pnpm run build", { cwd: dir, stdio: "inherit", timeout: 120_000 });
}

export function getSuperAppDir(
  saved: PubTunnelConfig | undefined,
  workspaceRoot: string,
  fallbackCwd = process.cwd(),
): string {
  if (saved?.devCommand) return path.resolve(saved.devCwd ?? fallbackCwd);
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

function assertCanExtractSuperApp(dir: string): void {
  if (!fs.existsSync(dir)) return;
  if (!fs.statSync(dir).isDirectory()) {
    throw new Error(`Refusing to initialize super-app at ${dir}: path is not a directory.`);
  }
  const entries = fs.readdirSync(dir);
  if (entries.length === 0) return;
  throw new Error(
    [
      `Refusing to initialize super-app at ${dir}: directory already exists and is not empty.`,
      "Move it aside, delete it, or configure tunnel.devCommand/tunnel.devCwd for a custom app.",
    ].join(" "),
  );
}

export function extractSuperAppBundle(bundlePath: string, dir: string): void {
  assertCanExtractSuperApp(dir);
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
  assertPnpmAvailable();
  return "pnpm";
}

function assertPnpmAvailable(): void {
  const result = spawnSync("pnpm", ["--version"], { stdio: "ignore", timeout: 5_000 });
  if (result.status !== 0) {
    throw new Error(
      "pnpm is required to manage the super-app workspace. " +
        "Install it from https://pnpm.io/installation and retry.",
    );
  }
}
