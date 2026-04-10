#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { killActiveChild } from "./lib/claude.js";
import { elapsed, log, warn } from "./lib/log.js";
import { processIdea, runIdeation, scanForIdeas, showStatus } from "./lib/pipeline.js";
import { idsInPhases, loadState, saveState } from "./lib/state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCKFILE = join(__dirname, ".run.lock");

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

function buildCtx(opts) {
  const outputDir = join(__dirname, "output");
  return {
    dirs: {
      root: __dirname,
      output: outputDir,
      prompts: join(__dirname, "prompts"),
      logs: join(outputDir, "logs"),
      pubs: join(outputDir, "pubs"),
    },
    stateFile: join(outputDir, "state.json"),
    model: opts.model,
    count: opts.count,
  };
}

const program = new Command()
  .name("batch-gen")
  .description("Batch-generate pub ideas, designs, and implementations via Claude")
  .option("--count <n>", "number of ideas to generate", (v) => Number.parseInt(v, 10), 50)
  .option("--model <model>", "Claude model to use", "sonnet")
  .option("--status", "show current pipeline status and exit");

program.parse();
const opts = program.opts();
const ctx = buildCtx(opts);

mkdirSync(ctx.dirs.logs, { recursive: true });
mkdirSync(ctx.dirs.pubs, { recursive: true });

if (opts.status) {
  showStatus(ctx);
  process.exit(0);
}

acquireLock();
process.on("exit", releaseLock);

function handleInterrupt() {
  warn("\nInterrupted — killing active subprocess");
  killActiveChild();
  try {
    showStatus(ctx);
  } catch {}
  process.exit(130);
}

process.on("SIGINT", handleInterrupt);
process.on("SIGTERM", handleInterrupt);

const pipelineStart = Date.now();
const state = loadState(ctx.stateFile);

// Recover orphan pub dirs from interrupted ideation
if (scanForIdeas(ctx.dirs.pubs, state)) {
  saveState(ctx.stateFile, state);
}

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
log(`total time: ${elapsed(pipelineStart)}`);
