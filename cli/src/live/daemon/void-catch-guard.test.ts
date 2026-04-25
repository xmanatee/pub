import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

function collectTsFiles(dir: string, result: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
      collectTsFiles(full, result);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      result.push(full);
    }
  }
  return result;
}

interface VoidCallSite {
  startLine: number;
  startColumn: number;
  /** Inclusive end position of the matching close paren of the awaited call. */
  endLine: number;
  endColumn: number;
}

/** Walk the source forward from a `void <ident>(` opener and return the
 *  position of the matching close paren. Skips chars inside string literals
 *  and template literals so commented or quoted `(` don't confuse balancing. */
function findVoidCallEnd(
  lines: string[],
  startLine: number,
  startColumn: number,
): VoidCallSite | null {
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let inEscape = false;
  for (let l = startLine; l < lines.length; l++) {
    const line = lines[l];
    const startCol = l === startLine ? startColumn : 0;
    for (let c = startCol; c < line.length; c++) {
      const ch = line[c];
      if (inEscape) {
        inEscape = false;
        continue;
      }
      if (inString) {
        if (ch === "\\") {
          inEscape = true;
          continue;
        }
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "(") {
        depth += 1;
        continue;
      }
      if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          return { startLine, startColumn, endLine: l, endColumn: c };
        }
      }
    }
  }
  return null;
}

/** Locate every `void <ident>(...)` statement in a file and check whether
 *  `.catch(` immediately follows the matching close paren of that call. The
 *  text between the close paren and `.catch(` may span multiple lines but must
 *  consist only of whitespace and method-chain dots, otherwise we treat it as
 *  a different expression and flag the void as unguarded. */
function findUnguardedVoidCalls(content: string): string[] {
  const lines = content.split("\n");
  const violations: string[] = [];
  // `void` must be at a statement-ish position — match line start, semicolon,
  // arrow body, or block opener — so we don't false-flag the `void` operator
  // appearing inside a larger expression.
  const opener = /(^|[\s;{}>])void\s+([a-zA-Z_$][\w$.]*)\s*\(/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    opener.lastIndex = 0;
    while (true) {
      const match = opener.exec(line);
      if (!match) break;
      const callOpenIdx = match.index + match[0].length - 1; // index of "("
      const end = findVoidCallEnd(lines, i, callOpenIdx);
      if (!end) {
        violations.push(`${i + 1}:${callOpenIdx + 1}: unbalanced void call`);
        continue;
      }
      // Scan forward from the close paren, allowing whitespace/dots, until we
      // either hit `.catch(` (good) or any other content (bad).
      let l = end.endLine;
      let c = end.endColumn + 1;
      let trailing = "";
      while (l < lines.length) {
        const segment = lines[l].slice(c);
        trailing += segment;
        if (trailing.trimStart().length > 0) break;
        l += 1;
        c = 0;
      }
      const trimmed = trailing.trimStart();
      if (
        !/^\.catch\s*\(/.test(trimmed) &&
        !/^\s*\.[\w$]+\s*\([^)]*\)\s*\.catch\s*\(/.test(trimmed)
      ) {
        violations.push(`${i + 1}: ${line.trim()}`);
      }
    }
  }
  return violations;
}

describe("void async call guard", () => {
  it("all `void <expr>(` calls in daemon files have .catch()", () => {
    const daemonDir = path.resolve(__dirname);
    const files = collectTsFiles(daemonDir);
    const violations: string[] = [];

    for (const file of files) {
      const relative = path.relative(daemonDir, file);
      const content = fs.readFileSync(file, "utf-8");
      for (const offence of findUnguardedVoidCalls(content)) {
        violations.push(`${relative}:${offence}`);
      }
    }

    expect(
      violations,
      "Unguarded `void asyncFn()` calls — add .catch() to prevent unhandled rejections",
    ).toEqual([]);
  });
});
