import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FEATURES = new URL("../features", import.meta.url).pathname;

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir);
  for (const name of entries) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(name)) yield full;
  }
}

describe("command boundaries", () => {
  it("does not type-cast external command results in feature code", async () => {
    const violations: string[] = [];

    for await (const file of walk(FEATURES)) {
      const content = await readFile(file, "utf8");
      if (/\b(?:invoke|runAI)\s*</.test(content)) {
        violations.push(relative(FEATURES, file));
      }
    }

    expect(violations).toEqual([]);
  });
});
