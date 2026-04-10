import pc from "picocolors";

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

function line(prefix, msg) {
  process.stdout.write(`  ${pc.dim(ts())}  ${prefix}${msg}\n`);
}

export function log(msg) {
  line("", msg);
}

export function ok(msg) {
  line(`${pc.green("\u2713")} `, msg);
}

export function warn(msg) {
  line(`${pc.yellow("\u26a0")} `, msg);
}

export function fail(msg) {
  line(`${pc.red("\u2717")} `, msg);
}

export function progressBar(done, total) {
  const w = 20;
  const filled = total > 0 ? Math.floor((done * w) / total) : 0;
  const empty = w - filled;
  return `${pc.green("\u2588".repeat(filled))}${pc.dim("\u2591".repeat(empty))} ${done}/${total}`;
}

export function itemProgress(done, total, phase, id) {
  line("", `${progressBar(done, total)}  ${pc.blue(phase.padEnd(12))} ${id}`);
}

export function elapsed(startMs) {
  const diff = Math.floor((Date.now() - startMs) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

export function phaseHeader(num, title) {
  process.stdout.write(
    `\n${pc.bold(pc.cyan(`\u2501\u2501\u2501 Phase ${num} `))}${pc.bold(`${title} \u2501\u2501\u2501`)}\n\n`,
  );
}

export function phaseDone(num, startMs) {
  process.stdout.write(
    `\n  ${pc.green("\u2713")} Phase ${num} complete ${pc.dim(`(${elapsed(startMs)})`)}\n`,
  );
}
