import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import { log, ok, warn, fail as logFail, itemProgress, elapsed, phaseHeader, phaseDone, progressBar, DIM, BOLD, RST, G } from "./log.mjs";
import { buildPrompt, buildPromptFromString } from "./template.mjs";
import { loadState, saveState, setPhase, getPhase, idsInPhases, countInPhase, countPastPhase, PHASES } from "./state.mjs";
import { runClaude } from "./claude.mjs";
import { publishPub, updatePub } from "./pub-cli.mjs";

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

export async function runIdeation(ctx, state) {
  const startMs = Date.now();
  phaseHeader(1, "Ideation");
  log(`Launching Claude to generate ${BOLD}${ctx.count}${RST} ideas...`);

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

  for (const entry of readdirSync(ctx.dirs.pubs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const ideaFile = join(ctx.dirs.pubs, entry.name, "idea.md");
    if (!existsSync(ideaFile)) continue;
    if (state.ideas.some((i) => i.id === entry.name)) continue;
    state.ideas.push({ id: entry.name, phase: "pending" });
  }

  state.ideas.sort((a, b) => a.id.localeCompare(b.id));
  saveState(ctx.stateFile, state);

  ok(`${BOLD}${state.ideas.length}${RST} ideas generated`);
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
    ok(`design ${DIM}${elapsed(startMs)}${RST}`);
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
    ok(`implement ${DIM}${elapsed(startMs)}${RST}`);
  }

  // Publish
  if (phase === "implemented" || phase === "publishing") {
    itemProgress(index, total, "publishing", id);
    setPhase(state, id, "publishing");
    saveState(ctx.stateFile, state);

    const metaFile = join(pubDir, "meta.json");
    const htmlFile = join(pubDir, "index.html");
    const result = publishPub(metaFile, htmlFile);

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

    log(`  ${DIM}generating mocks...${RST}`);
    const mockPrompt = readFileSync(join(ctx.dirs.prompts, "mock-gen.md"), "utf-8");
    await runClaude(ctx, {
      prompt: mockPrompt,
      cwd: pubDir,
      logFile: join(ctx.dirs.logs, `mock-${id}.log`),
    });

    log(`  ${DIM}browser test...${RST}`);
    const testResult = spawnSync(
      "node",
      [join(ctx.dirs.root, "test-runner.mjs"), pubDir],
      {
        stdio: "pipe",
        encoding: "utf-8",
      },
    );

    setPhase(state, id, "tested");
    saveState(ctx.stateFile, state);
    phase = "tested";

    if (testResult.status === 0) {
      ok(`test pass ${DIM}${elapsed(startMs)}${RST}`);
    } else {
      let errors = 0;
      const reportPath = join(pubDir, "test-report.json");
      if (existsSync(reportPath)) {
        const report = JSON.parse(readFileSync(reportPath, "utf-8"));
        errors = report.errors;
      }
      warn(`test: ${errors} error(s) ${DIM}${elapsed(startMs)}${RST}`);
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
      const result = updatePub(meta.slug, join(pubDir, "index.html"));
      if (result.ok) {
        ok(`reviewed + updated ${DIM}${elapsed(startMs)}${RST}`);
      } else {
        warn(`reviewed but update failed ${DIM}${elapsed(startMs)}${RST}`);
      }
    } else {
      ok(`reviewed (no changes) ${DIM}${elapsed(startMs)}${RST}`);
    }

    setPhase(state, id, "reviewed");
    saveState(ctx.stateFile, state);
  }
}

export function showStatus(ctx) {
  const state = loadState(ctx.stateFile);
  const total = state.ideas.length;

  process.stdout.write(`\n${BOLD}  Pub Batch Generator${RST}\n`);
  process.stdout.write(`  ${DIM}state: ${ctx.stateFile}${RST}\n\n`);

  if (total === 0) {
    process.stdout.write(`  ${DIM}No ideas generated yet.${RST}\n\n`);
    return;
  }

  const publishedPlus = countPastPhase(state, "published");
  const reviewedCount = countInPhase(state, "reviewed");

  process.stdout.write(`  ${BOLD}${"Ideation".padEnd(22)}${RST}  ${G}\u2713 ${total} ideas${RST}\n`);
  process.stdout.write(`  ${BOLD}${"Build+Publish".padEnd(22)}${RST}  ${progressBar(publishedPlus, total)}\n`);
  process.stdout.write(`  ${BOLD}${"Test+Review".padEnd(22)}${RST}  ${progressBar(reviewedCount, total)}\n`);

  process.stdout.write(`\n  ${DIM}\u2500\u2500\u2500 breakdown \u2500\u2500\u2500${RST}\n`);
  for (const p of PHASES) {
    const c = countInPhase(state, p);
    if (c === 0) continue;
    let color = DIM;
    if (["designing", "implementing", "testing", "reviewing", "publishing"].includes(p)) {
      color = "\x1b[0;33m";
    } else if (p === "reviewed") {
      color = "\x1b[0;32m";
    }
    process.stdout.write(`  ${color}${p.padEnd(14)} ${String(c).padStart(3)}${RST}\n`);
  }
  process.stdout.write("\n");
}
