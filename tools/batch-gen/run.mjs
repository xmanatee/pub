#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadState, idsInPhases } from "./lib/state.mjs";
import { runIdeation, processIdea, showStatus } from "./lib/pipeline.mjs";
import { killActiveChild } from "./lib/claude.mjs";
import { elapsed, warn } from "./lib/log.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCKFILE = join(__dirname, ".run.lock");

function parseArgs(argv) {
  const args = { count: 50, model: "sonnet", status: false };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    switch (rest[i]) {
      case "--count":
        args.count = Number(rest[++i]);
        break;
      case "--model":
        args.model = rest[++i];
        break;
      case "--status":
        args.status = true;
        break;
      default:
        console.error(`Usage: node run.mjs [--count N] [--model MODEL] [--status]`);
        process.exit(1);
    }
  }
  return args;
}

function acquireLock() {
  if (existsSync(LOCKFILE)) {
    const pid = Number(readFileSync(LOCKFILE, "utf-8").trim());
    try {
      process.kill(pid, 0);
      console.error(`Already running (pid ${pid}). Use --status to check progress.`);
      process.exit(1);
    } catch {
      unlinkSync(LOCKFILE);
    }
  }
  writeFileSync(LOCKFILE, String(process.pid));
}

function releaseLock() {
  try {
    if (existsSync(LOCKFILE)) unlinkSync(LOCKFILE);
  } catch {}
}

const args = parseArgs(process.argv);
const outputDir = join(__dirname, "output");
const ctx = {
  dirs: {
    root: __dirname,
    output: outputDir,
    prompts: join(__dirname, "prompts"),
    logs: join(outputDir, "logs"),
    pubs: join(outputDir, "pubs"),
  },
  stateFile: join(outputDir, "state.json"),
  model: args.model,
  count: args.count,
};

mkdirSync(ctx.dirs.logs, { recursive: true });
mkdirSync(ctx.dirs.pubs, { recursive: true });

if (args.status) {
  showStatus(ctx);
  process.exit(0);
}

acquireLock();
process.on("exit", releaseLock);

function handleInterrupt() {
  warn("\nInterrupted — killing active subprocess");
  killActiveChild();
  showStatus(ctx);
  releaseLock();
  process.exit(130);
}

process.on("SIGINT", handleInterrupt);
process.on("SIGTERM", handleInterrupt);

const pipelineStart = Date.now();
const state = loadState(ctx.stateFile);

if (state.ideas.length === 0) {
  await runIdeation(ctx, state);
}

const incomplete = idsInPhases(
  state,
  "pending",
  "designing",
  "designed",
  "implementing",
  "implemented",
  "publishing",
  "published",
  "testing",
  "tested",
  "reviewing",
);

for (let i = 0; i < incomplete.length; i++) {
  await processIdea(ctx, state, incomplete[i], i + 1, incomplete.length);
}

showStatus(ctx);
console.log(`  total time: ${elapsed(pipelineStart)}\n`);
