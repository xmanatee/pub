#!/usr/bin/env node
/**
 * Build the super-app source tarball embedded in the pub CLI binary. At
 * `pub start` time the CLI extracts it into the user's workspace and boots
 * `vite dev` there — source the agent can edit live.
 *
 * Pub's only transformation is rewriting the `@shared/*` alias from the
 * monorepo-relative `../../shared` to the standalone `./shared` and bundling
 * `shared/` alongside. Everything else — dependencies, scripts, lint config,
 * test setup — is super-app's own declaration.
 *
 * The tarball ships with a pnpm-lock.yaml generated against a standalone
 * (non-workspace) copy of super-app so the CLI can install with
 * `--frozen-lockfile`. Without the lockfile, a fresh install resolves caret
 * ranges to latest and a bad upstream release (e.g. a new required peer dep
 * landing in a transitive) breaks every user's first `pub start`.
 */
import { execSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(SCRIPT_DIR, "..");
const PUB_ROOT = resolve(CLI_DIR, "..");
const SUPER_APP_DIR = join(PUB_ROOT, "packages", "super-app");
const SHARED_DIR = join(PUB_ROOT, "shared");
const OUT_PATH = join(CLI_DIR, "assets", "super-app-source.tar.gz");

const SOURCE_ENTRIES = [
  "src",
  "scripts",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "biome.json",
];

function stageLayout(payload) {
  mkdirSync(payload, { recursive: true });
  for (const entry of SOURCE_ENTRIES) {
    cpSync(join(SUPER_APP_DIR, entry), join(payload, entry), { recursive: true });
  }
  rmSync(join(payload, "src", "routeTree.gen.ts"), { force: true });
  cpSync(SHARED_DIR, join(payload, "shared"), { recursive: true });
  // `shared/` is a monorepo vendoring, not a super-app authored surface —
  // its test files belong to pub and would otherwise get picked up by
  // super-app's vitest in the extracted workspace.
  stripTestFiles(join(payload, "shared"));
  rewriteSharedAliases(payload);
}

function stripTestFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      stripTestFiles(full);
    } else if (/\.test\.(ts|tsx)$/.test(entry.name)) {
      rmSync(full);
    }
  }
}

function rewriteSharedAliases(payload) {
  const viteConfigPath = join(payload, "vite.config.ts");
  writeFileSync(
    viteConfigPath,
    readFileSync(viteConfigPath, "utf8").replace(
      'path.resolve(__dirname, "../../shared")',
      'path.resolve(__dirname, "shared")',
    ),
  );
  const tsconfigPath = join(payload, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    readFileSync(tsconfigPath, "utf8").replace('"../../shared/*"', '"./shared/*"'),
  );
}

function generateLockfile(payload) {
  execSync("pnpm install --lockfile-only --ignore-workspace", {
    cwd: payload,
    stdio: "inherit",
  });
}

const stageRoot = mkdtempSync(join(tmpdir(), "pub-super-app-bundle-"));
try {
  const payload = join(stageRoot, "payload");
  stageLayout(payload);
  generateLockfile(payload);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  execSync(`tar --exclude=node_modules -czf "${OUT_PATH}" -C "${payload}" .`, {
    stdio: "inherit",
  });
  console.log(`super-app bundle: ${OUT_PATH} (${statSync(OUT_PATH).size} bytes)`);
} finally {
  rmSync(stageRoot, { recursive: true, force: true });
}
