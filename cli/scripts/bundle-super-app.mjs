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
 * pnpm workspace (packages: [.]) so `pub start` can install with
 * `--frozen-lockfile` and pin every transitive to what was tested at bundle
 * time. The workspace marker also opts the four postinstall scripts pnpm 11
 * fails closed on (esbuild, bufferutil, utf-8-validate, es5-ext) into
 * `allowBuilds`, and stops pnpm from walking up into a parent monorepo if
 * `pub start` is run from inside one.
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
  writePnpmWorkspace(payload);
}

function writePnpmWorkspace(payload) {
  // pnpm 11 fails closed on skipped postinstall scripts. Each dep that
  // declares one needs an explicit allowBuilds decision:
  //   esbuild         (true)  — vite/vitest's bundler; postinstall verifies
  //                             the platform binary that ships as an optional
  //                             dep. Cheap, no toolchain needed.
  //   es5-ext         (true)  — funding banner postinstall, no-op otherwise.
  //   bufferutil      (false) — optional `ws` native perf module; postinstall
  //                             invokes node-gyp which requires make + a C
  //                             compiler. Not assumed on user laptops or in
  //                             our Playwright base image. ws falls back to a
  //                             pure-JS implementation when the native build
  //                             is absent.
  //   utf-8-validate  (false) — same story as bufferutil.
  // `packages: [.]` makes the extracted dir its own workspace root so
  // pnpm reads allowBuilds (and doesn't reach into a parent monorepo if
  // `pub start` runs inside one).
  writeFileSync(
    join(payload, "pnpm-workspace.yaml"),
    [
      "packages:",
      "  - .",
      "allowBuilds:",
      "  bufferutil: false",
      "  es5-ext: true",
      "  esbuild: true",
      "  utf-8-validate: false",
      "",
    ].join("\n"),
  );
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
  execSync("pnpm install --lockfile-only", {
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
