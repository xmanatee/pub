import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { spawn, spawnSync } from "child_process";
import pc from "picocolors";
import { log, ok, warn, fail as logFail, itemProgress, elapsed, phaseHeader, phaseDone, progressBar } from "./log.js";
import { buildPrompt, buildPromptFromString } from "./template.js";
import { loadState, saveState, setPhase, getPhase, countInPhase, countPastPhase, PHASES } from "./state.js";
import { runClaude } from "./claude.js";
import { publishPub, updatePub } from "./pub-cli.js";

function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function ensurePlaywright(scriptDir) {
  const check = spawnSync("node", ["-e", "require('playwright')"], {
    cwd: scriptDir,
    stdio: "ignore",
  });
  if (check.status !== 0) {
    log("Installing playwright...");
    spawnSync("npm", ["install"], { cwd: scriptDir, stdio: "inherit" });
    spawnSync("npx", ["playwright", "install", "chromium"], {
      cwd: scriptDir,
      stdio: "inherit",
    });
  }
}

function runTestRunner(scriptDir, pubDir) {
  return new Promise((resolve) => {
    const child = spawn("node", [join(scriptDir, "test-runner.js"), pubDir], {
      stdio: "pipe",
    });
    child.on("close", (code) => resolve({ ok: code === 0, exitCode: code ?? 1 }));
    child.on("error", () => resolve({ ok: false, exitCode: 1 }));
  });
}

export function scanForIdeas(pubsDir, state) {
  if (!existsSync(pubsDir)) return false;
  let added = false;
  for (const entry of readdirSync(pubsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const ideaFile = join(pubsDir, entry.name, "idea.md");
    if (!existsSync(ideaFile)) continue;
    if (state.ideas.some((i) => i.id === entry.name)) continue;
    state.ideas.push({ id: entry.name, phase: "pending" });
    added = true;
  }
  if (added) state.ideas.sort((a, b) => a.id.localeCompare(b.id));
  return added;
}

export async function runIdeation(ctx, state) {
  const startMs = Date.now();
  phaseHeader(1, "Ideation");
  log(`Launching Claude to generate ${pc.bold(ctx.count)} ideas...`);

  const prompt = buildPromptFromString(
    join(ctx.dirs.prompts, "ideation.md"),
    "{{IDEA_COUNT}}",
    String(ctx.count),
  );

  await runClaude(ctx, {
    prompt,
    cwd: ctx.dirs.output,
    logFile: join(ctx.dirs.logs, "phase1-ideation.log"),
  });

  scanForIdeas(ctx.dirs.pubs, state);
  saveState(ctx.stateFile, state);

  ok(`${pc.bold(state.ideas.length)} ideas generated`);
  phaseDone(1, startMs);
}

export async function processIdea(ctx, state, id, index, total) {
  const pubDir = join(ctx.dirs.pubs, id);
  let phase = getPhase(state, id);

  // Design
  if (phase === "pending" || phase === "designing") {
    const startMs = Date.now();
    itemProgress(index, total, "designing", id);

    const ideaFile = join(pubDir, "idea.md");
    if (!existsSync(ideaFile)) {
      logFail("idea.md missing");
      return;
    }

    setPhase(state, id, "designing");
    saveState(ctx.stateFile, state);

    const result = await runClaude(ctx, {
      prompt: buildPrompt(join(ctx.dirs.prompts, "design.md"), "{{IDEA_CONTENT}}", ideaFile),
      cwd: pubDir,
      logFile: join(ctx.dirs.logs, `design-${id}.log`),
    });

    if (!existsSync(join(pubDir, "design.md"))) {
      logFail(`design.md not created (exit ${result.exitCode})`);
      return;
    }

    setPhase(state, id, "designed");
    saveState(ctx.stateFile, state);
    phase = "designed";
    ok(`design ${pc.dim(elapsed(startMs))}`);
  }

  // Implement
  if (phase === "designed" || phase === "implementing") {
    const startMs = Date.now();
    itemProgress(index, total, "implementing", id);

    const designFile = join(pubDir, "design.md");
    if (!existsSync(designFile)) {
      logFail("design.md missing");
      return;
    }

    setPhase(state, id, "implementing");
    saveState(ctx.stateFile, state);

    const result = await runClaude(ctx, {
      prompt: buildPrompt(join(ctx.dirs.prompts, "implement.md"), "{{DESIGN_CONTENT}}", designFile),
      cwd: pubDir,
      logFile: join(ctx.dirs.logs, `impl-${id}.log`),
    });

    if (!existsSync(join(pubDir, "index.html")) || !existsSync(join(pubDir, "meta.json"))) {
      logFail(`index.html or meta.json not created (exit ${result.exitCode})`);
      return;
    }

    setPhase(state, id, "implemented");
    saveState(ctx.stateFile, state);
    phase = "implemented";
    ok(`implement ${pc.dim(elapsed(startMs))}`);
  }

  // Publish
  if (phase === "implemented" || phase === "publishing") {
    itemProgress(index, total, "publishing", id);
    setPhase(state, id, "publishing");
    saveState(ctx.stateFile, state);

    const metaFile = join(pubDir, "meta.json");
    const htmlFile = join(pubDir, "index.html");
    const result = await publishPub(metaFile, htmlFile);

    if (result.ok) {
      setPhase(state, id, "published");
      saveState(ctx.stateFile, state);
      phase = "published";
    } else {
      setPhase(state, id, "implemented");
      saveState(ctx.stateFile, state);
      return;
    }
  }

  // Test
  if (phase === "published" || phase === "testing") {
    const startMs = Date.now();
    itemProgress(index, total, "testing", id);

    if (!existsSync(join(pubDir, "index.html"))) {
      logFail("index.html missing");
      return;
    }

    setPhase(state, id, "testing");
    saveState(ctx.stateFile, state);

    ensurePlaywright(ctx.dirs.root);

    log(`  ${pc.dim("generating mocks...")}`);
    const mockPrompt = readFileSync(join(ctx.dirs.prompts, "mock-gen.md"), "utf-8");
    await runClaude(ctx, {
      prompt: mockPrompt,
      cwd: pubDir,
      logFile: join(ctx.dirs.logs, `mock-${id}.log`),
    });

    log(`  ${pc.dim("browser test...")}`);
    const testResult = await runTestRunner(ctx.dirs.root, pubDir);

    setPhase(state, id, "tested");
    saveState(ctx.stateFile, state);
    phase = "tested";

    if (testResult.ok) {
      ok(`test pass ${pc.dim(elapsed(startMs))}`);
    } else {
      let errors = 0;
      const reportPath = join(pubDir, "test-report.json");
      if (existsSync(reportPath)) {
        const report = JSON.parse(readFileSync(reportPath, "utf-8"));
        errors = report.errors;
      }
      warn(`test: ${errors} error(s) ${pc.dim(elapsed(startMs))}`);
    }
  }

  // Review
  if (phase === "tested" || phase === "reviewing") {
    const startMs = Date.now();
    itemProgress(index, total, "reviewing", id);

    if (!existsSync(join(pubDir, "index.html")) || !existsSync(join(pubDir, "design.md"))) {
      logFail("missing files for review");
      setPhase(state, id, "reviewed");
      saveState(ctx.stateFile, state);
      return;
    }

    setPhase(state, id, "reviewing");
    saveState(ctx.stateFile, state);

    const hashBefore = sha256(join(pubDir, "index.html"));

    const reviewPrompt = readFileSync(join(ctx.dirs.prompts, "review.md"), "utf-8");
    await runClaude(ctx, {
      prompt: reviewPrompt,
      cwd: pubDir,
      logFile: join(ctx.dirs.logs, `review-${id}.log`),
    });

    const hashAfter = sha256(join(pubDir, "index.html"));

    if (hashBefore !== hashAfter) {
      const meta = JSON.parse(readFileSync(join(pubDir, "meta.json"), "utf-8"));
      const result = await updatePub(meta.slug, join(pubDir, "index.html"));
      if (result.ok) {
        ok(`reviewed + updated ${pc.dim(elapsed(startMs))}`);
      } else {
        warn(`reviewed but update failed ${pc.dim(elapsed(startMs))}`);
      }
    } else {
      ok(`reviewed (no changes) ${pc.dim(elapsed(startMs))}`);
    }

    setPhase(state, id, "reviewed");
    saveState(ctx.stateFile, state);
  }
}

export function showStatus(ctx) {
  const state = loadState(ctx.stateFile);
  const total = state.ideas.length;

  const IN_PROGRESS_PHASES = ["designing", "implementing", "testing", "reviewing", "publishing"];

  process.stdout.write(`\n${pc.bold("  Pub Batch Generator")}\n`);
  process.stdout.write(`  ${pc.dim(`state: ${ctx.stateFile}`)}\n\n`);

  if (total === 0) {
    process.stdout.write(`  ${pc.dim("No ideas generated yet.")}\n\n`);
    return;
  }

  const publishedPlus = countPastPhase(state, "published");
  const reviewedCount = countInPhase(state, "reviewed");

  process.stdout.write(`  ${pc.bold("Ideation".padEnd(22))}  ${pc.green(`\u2713 ${total} ideas`)}\n`);
  process.stdout.write(`  ${pc.bold("Build+Publish".padEnd(22))}  ${progressBar(publishedPlus, total)}\n`);
  process.stdout.write(`  ${pc.bold("Test+Review".padEnd(22))}  ${progressBar(reviewedCount, total)}\n`);

  process.stdout.write(`\n  ${pc.dim("\u2500\u2500\u2500 breakdown \u2500\u2500\u2500")}\n`);
  for (const p of PHASES) {
    const c = countInPhase(state, p);
    if (c === 0) continue;
    const fmt = IN_PROGRESS_PHASES.includes(p) ? pc.yellow : p === "reviewed" ? pc.green : pc.dim;
    process.stdout.write(`  ${fmt(`${p.padEnd(14)} ${String(c).padStart(3)}`)}\n`);
  }
  process.stdout.write("\n");
}
