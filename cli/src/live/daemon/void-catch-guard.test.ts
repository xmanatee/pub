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

describe("void async call guard", () => {
  it("all `void <expr>(` calls in daemon files have .catch()", () => {
    const daemonDir = path.resolve(__dirname);
    const files = collectTsFiles(daemonDir);
    const violations: string[] = [];

    for (const file of files) {
      const relative = path.relative(daemonDir, file);
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/\bvoid\s+\S+\(/.test(line)) continue;
        // Check if .catch( appears on this line or the next line
        const nextLine = lines[i + 1] ?? "";
        if (/\.catch\s*\(/.test(line) || /\.catch\s*\(/.test(nextLine)) continue;
        violations.push(`${relative}:${i + 1}: ${line.trim()}`);
      }
    }

    expect(
      violations,
      "Unguarded `void asyncFn()` calls — add .catch() to prevent unhandled rejections",
    ).toEqual([]);
  });
});
