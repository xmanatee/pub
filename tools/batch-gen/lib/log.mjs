const isTTY = process.stdout.isTTY;

const R = isTTY ? "\x1b[0;31m" : "";
const G = isTTY ? "\x1b[0;32m" : "";
const Y = isTTY ? "\x1b[0;33m" : "";
const B = isTTY ? "\x1b[0;34m" : "";
const C = isTTY ? "\x1b[0;36m" : "";
const DIM = isTTY ? "\x1b[2m" : "";
const BOLD = isTTY ? "\x1b[1m" : "";
const RST = isTTY ? "\x1b[0m" : "";

const OK = "\u2713";
const FAIL = "\u2717";
const WARN = "\u26a0";

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

export function log(msg) {
  process.stdout.write(`  ${DIM}${ts()}${RST}  ${msg}\n`);
}

export function ok(msg) {
  process.stdout.write(`  ${DIM}${ts()}${RST}  ${G}${OK}${RST} ${msg}\n`);
}

export function warn(msg) {
  process.stdout.write(`  ${DIM}${ts()}${RST}  ${Y}${WARN}${RST} ${msg}\n`);
}

export function fail(msg) {
  process.stdout.write(`  ${DIM}${ts()}${RST}  ${R}${FAIL}${RST} ${msg}\n`);
}

export function progressBar(done, total) {
  const w = 20;
  const filled = total > 0 ? Math.floor((done * w) / total) : 0;
  const empty = w - filled;
  return `${G}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RST} ${done}/${total}`;
}

export function itemProgress(done, total, phase, id) {
  process.stdout.write(
    `  ${DIM}${ts()}${RST}  ${progressBar(done, total)}  ${B}${phase.padEnd(12)}${RST} ${id}\n`,
  );
}

export function elapsed(startMs) {
  const diff = Math.floor((Date.now() - startMs) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

export function phaseHeader(num, title) {
  process.stdout.write(`\n${BOLD}${C}\u2501\u2501\u2501 Phase ${num} ${RST}${BOLD}${title} \u2501\u2501\u2501${RST}\n\n`);
}

export function phaseDone(num, startMs) {
  process.stdout.write(`\n  ${G}${OK}${RST} Phase ${num} complete ${DIM}(${elapsed(startMs)})${RST}\n`);
}

export { DIM, BOLD, RST, G, Y };
