interface Mark {
  label: string;
  elapsed: number;
  delta: number;
}

let t0 = 0;
let lastMark = 0;
let marks: Mark[] = [];
let active = false;

export function profileStart(): void {
  t0 = performance.now();
  lastMark = t0;
  marks = [];
  active = true;
}

export function profileMark(label: string): void {
  if (!active) return;
  const now = performance.now();
  marks.push({
    label,
    elapsed: Math.round(now - t0),
    delta: Math.round(now - lastMark),
  });
  lastMark = now;
}

export function profilePrint(): void {
  if (!active || marks.length === 0) return;
  active = false;
  const total = marks[marks.length - 1].elapsed;
  console.groupCollapsed(`[live-profile] Connection took ${total}ms (${marks.length} phases)`);
  console.table(
    marks.map((m) => ({
      phase: m.label,
      "elapsed (ms)": m.elapsed,
      "delta (ms)": m.delta,
    })),
  );
  console.groupEnd();
}
