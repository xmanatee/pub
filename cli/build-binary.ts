#!/usr/bin/env bun
/**
 * Build standalone binaries for all targets using `bun build --compile`.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const ENTRY = "src/index.ts";
const OUT_DIR = "dist-bin";

const TARGETS = [
  { bun: "bun-darwin-arm64", suffix: "darwin-arm64" },
  { bun: "bun-darwin-x64", suffix: "darwin-x64" },
  { bun: "bun-linux-x64", suffix: "linux-x64" },
  { bun: "bun-linux-arm64", suffix: "linux-arm64" },
] as const;

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const target of TARGETS) {
  const outfile = path.join(OUT_DIR, `pub-${target.suffix}`);
  const cmd = `bun build --compile --target=${target.bun} --minify ${ENTRY} --outfile ${outfile}`;
  console.log(`Building ${target.suffix}...`);
  execSync(cmd, { stdio: "inherit" });
  console.log(`Done: ${outfile}`);
}
