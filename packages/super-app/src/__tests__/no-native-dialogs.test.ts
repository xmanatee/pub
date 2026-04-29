/**
 * Bans the native `window.alert/confirm/prompt` and the legacy
 * `withErrorAlert` helper from source. Replacements live in
 * `core/hooks/{use-toast,use-confirm,use-prompt}` — those hooks return
 * locals named `toast/confirm/promptUser`, so a bare `confirm(...)` in a
 * feature is just calling the hook's return; only `window.`-prefixed
 * forms are forbidden here.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL("..", import.meta.url).pathname;

const SKIP = new Set<string>([
  join(SRC, "__tests__", "no-native-dialogs.test.ts"),
  join(SRC, "features", "reader", "sanitize.test.ts"),
]);

const FORBIDDEN = [
  /\bwindow\.(?:alert|confirm|prompt)\s*\(/,
  /\bglobalThis\.(?:alert|confirm|prompt)\s*\(/,
  /(?<![\w.])alert\s*\(/, // bare global `alert(...)`
  /\bwithErrorAlert\b/,
];

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir);
  for (const name of entries) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(name)) yield full;
  }
}

describe("no-native-dialogs", () => {
  it("does not call window.alert/confirm/prompt or withErrorAlert", async () => {
    const offenders: string[] = [];
    for await (const file of walk(SRC)) {
      if (SKIP.has(file)) continue;
      const content = await readFile(file, "utf8");
      const stripped = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const pattern of FORBIDDEN) {
        const m = stripped.match(pattern);
        if (m) offenders.push(`${relative(SRC, file)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
