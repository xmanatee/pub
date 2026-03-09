#!/usr/bin/env bun
/**
 * Build standalone binaries for multiple targets using `bun build --compile`.
 *
 * Usage:
 *   bun run build-binary.ts            # all targets
 *   bun run build-binary.ts --local    # current platform only
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const ENTRY = "src/index.ts";
const OUT_DIR = "dist-bin";
const EXTERNAL = "@anthropic-ai/claude-agent-sdk";

const TARGETS = [
  { bun: "bun-darwin-arm64", suffix: "darwin-arm64" },
  { bun: "bun-darwin-x64", suffix: "darwin-x64" },
  { bun: "bun-linux-x64", suffix: "linux-x64" },
  { bun: "bun-linux-arm64", suffix: "linux-arm64" },
] as const;

const isLocal = process.argv.includes("--local");

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

if (isLocal) {
  const outfile = path.join(OUT_DIR, "pubblue");
  const cmd = `bun build --compile --external ${EXTERNAL} --minify ${ENTRY} --outfile ${outfile}`;
  console.log(`Building local binary: ${outfile}`);
  execSync(cmd, { stdio: "inherit" });
  console.log(`Done: ${outfile}`);
} else {
  for (const target of TARGETS) {
    const outfile = path.join(OUT_DIR, `pubblue-${target.suffix}`);
    const cmd = `bun build --compile --target=${target.bun} --external ${EXTERNAL} --minify ${ENTRY} --outfile ${outfile}`;
    console.log(`Building ${target.suffix}...`);
    execSync(cmd, { stdio: "inherit" });
    console.log(`Done: ${outfile}`);
  }
}
