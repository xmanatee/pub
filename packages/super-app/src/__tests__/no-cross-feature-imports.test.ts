/**
 * Features must not import from sibling features. Cross-feature behavior
 * lives in `core/`. Inbox is the single exception (it deliberately surfaces
 * data from mail/calendar/tasks).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FEATURES = new URL("../features", import.meta.url).pathname;
const ALLOWED_CROSS_FEATURE = new Set<string>(["inbox"]);

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir);
  for (const name of entries) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(name)) yield full;
  }
}

const IMPORT_RE = /from\s+["']~\/features\/([\w-]+)/g;

describe("no-cross-feature-imports", () => {
  it("each feature only imports from itself or core", async () => {
    const violations: string[] = [];
    for await (const file of walk(FEATURES)) {
      const rel = relative(FEATURES, file);
      const owner = rel.split("/")[0];
      if (ALLOWED_CROSS_FEATURE.has(owner)) continue;
      const content = await readFile(file, "utf8");
      for (const m of content.matchAll(IMPORT_RE)) {
        const target = m[1];
        if (target !== owner) {
          violations.push(`${rel}: imports ~/features/${target}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
