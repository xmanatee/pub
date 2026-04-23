import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTunnelConfig,
  ensureSuperAppWorkspace,
  extractSuperAppBundle,
  getSuperAppDir,
  isSuperAppInitialized,
} from "./workspace.js";

function buildFixtureTarball(bundleDir: string): string {
  const stage = join(bundleDir, "stage");
  mkdirSync(join(stage, "src"), { recursive: true });
  writeFileSync(join(stage, "package.json"), JSON.stringify({ name: "pub-super-app" }));
  writeFileSync(join(stage, "src", "router.tsx"), "// fixture\n");
  const tarball = join(bundleDir, "fixture.tar.gz");
  execSync(`tar -czf "${tarball}" -C "${stage}" .`);
  return tarball;
}

function seedInitializedWorkspace(dir: string): void {
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "pub-super-app" }));
}

describe("super-app workspace", () => {
  let root: string;
  let bundleDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "super-app-ws-"));
    bundleDir = mkdtempSync(join(tmpdir(), "super-app-bundle-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(bundleDir, { recursive: true, force: true });
  });

  it("buildTunnelConfig roots every field at the workspace dir", () => {
    const config = buildTunnelConfig("/tmp/abc/super-app");
    expect(config.devCwd).toBe("/tmp/abc/super-app");
    expect(config.devPort).toBe(5173);
    expect(config.devCommand).toContain("vite");
    expect(config.relayUrl).toBeTruthy();
  });

  it("getSuperAppDir uses a saved custom dev cwd when the tunnel app is overridden", () => {
    expect(
      getSuperAppDir(
        { devCommand: "pnpm dev", devCwd: "/tmp/custom-app", devPort: 5173 },
        "/tmp/pub-workspaces",
        "/tmp/fallback",
      ),
    ).toBe("/tmp/custom-app");
  });

  it("getSuperAppDir falls back to the cwd for custom tunnel configs without devCwd", () => {
    expect(
      getSuperAppDir({ devCommand: "pnpm dev", devPort: 5173 }, "/tmp/pub-workspaces", "/tmp/app"),
    ).toBe("/tmp/app");
  });

  it("isSuperAppInitialized requires both package.json and node_modules", () => {
    const dir = join(root, "app");
    expect(isSuperAppInitialized(dir)).toBe(false);

    mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), "{}");
    expect(isSuperAppInitialized(dir)).toBe(false);

    mkdirSync(join(dir, "node_modules"));
    expect(isSuperAppInitialized(dir)).toBe(true);
  });

  it("extractSuperAppBundle writes the tarball contents into the target dir", () => {
    const dir = join(root, "app");
    extractSuperAppBundle(buildFixtureTarball(bundleDir), dir);
    expect(existsSync(join(dir, "package.json"))).toBe(true);
    expect(existsSync(join(dir, "src", "router.tsx"))).toBe(true);
  });

  it("extractSuperAppBundle throws when the bundle path is missing", () => {
    const missing = join(bundleDir, "does-not-exist.tar.gz");
    expect(() => extractSuperAppBundle(missing, join(root, "app"))).toThrow();
  });

  it("extractSuperAppBundle refuses to write into a non-empty directory", () => {
    const dir = join(root, "app");
    mkdirSync(dir);
    writeFileSync(join(dir, "user-edit.txt"), "do not replace");

    expect(() => extractSuperAppBundle(buildFixtureTarball(bundleDir), dir)).toThrow(
      /Refusing to initialize super-app/,
    );
    expect(existsSync(join(dir, "user-edit.txt"))).toBe(true);
  });

  it("ensureSuperAppWorkspace is a no-op when already initialized", () => {
    const dir = join(root, "super-app");
    seedInitializedWorkspace(dir);
    writeFileSync(join(dir, "user-edit.txt"), "agent wrote this");

    const result = ensureSuperAppWorkspace(root);
    expect(result.dir).toBe(dir);
    expect(result.wasInitialized).toBe(false);
    expect(existsSync(join(dir, "user-edit.txt"))).toBe(true);
  });
});
