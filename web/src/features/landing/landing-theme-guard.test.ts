import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LANDING_DIR = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN: Array<{ name: string; pattern: RegExp }> = [
  { name: "pure-white-rgb", pattern: /rgba?\(\s*255\s*,\s*255\s*,\s*255/ },
  { name: "pure-black-rgb", pattern: /rgba?\(\s*0\s*,\s*0\s*,\s*0[\s,)]/ },
  { name: "hex-white", pattern: /#(fff|ffffff)\b/i },
  { name: "hex-black", pattern: /#(000|000000)\b/ },
];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(tsx?|css)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

const files = walk(LANDING_DIR);

describe("landing uses theme tokens, never hardcoded colors", () => {
  for (const file of files) {
    const relPath = relative(LANDING_DIR, file);
    it(relPath, () => {
      const content = readFileSync(file, "utf8");
      for (const { name, pattern } of FORBIDDEN) {
        expect(
          pattern.test(content),
          `${relPath} contains hardcoded color (${name}). Use var(--background), var(--foreground), or color-mix(in oklab, var(--…), transparent) so the section honors dark/light theme.`,
        ).toBe(false);
      }
    });
  }

  it("scans at least one landing file", () => {
    expect(files.length).toBeGreaterThan(0);
  });
});
