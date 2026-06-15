import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("..", import.meta.url).pathname;

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir);
  for (const name of entries) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(name)) yield full;
  }
}

function isServerOnly(relativePath: string): boolean {
  return (
    relativePath.endsWith(".server.ts") ||
    relativePath.endsWith("/server.ts") ||
    relativePath.includes("/__tests__/") ||
    relativePath.endsWith(".test.ts") ||
    relativePath.endsWith(".test.tsx")
  );
}

describe("browser boundary", () => {
  it("keeps Node builtins out of client-reachable modules", async () => {
    const violations: string[] = [];

    for await (const file of walk(SRC)) {
      const rel = relative(SRC, file);
      if (isServerOnly(rel)) continue;

      const content = await readFile(file, "utf8");
      if (/["']node:/.test(content)) violations.push(rel);
    }

    expect(violations).toEqual([]);
  });
});
