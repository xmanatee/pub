import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWED_FILE = "core/process/exit.ts";

// Daemon launcher is a short-lived spawner that never initializes Sentry.
// Its single exit is a programmer-error guard, not a runtime failure path.
const EXEMPTED_FILES = new Set(["app/live-daemon-launcher-entry.ts"]);

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

describe("process.exit guard", () => {
  it("only exit.ts may call process.exit()", () => {
    const srcDir = path.resolve(__dirname, "../../");
    const files = collectTsFiles(srcDir);
    const violations: string[] = [];
    for (const file of files) {
      const relative = path.relative(srcDir, file);
      if (relative === ALLOWED_FILE || EXEMPTED_FILES.has(relative)) continue;
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/process\.exit\s*\(/.test(lines[i])) {
          violations.push(`${relative}:${i + 1}`);
        }
      }
    }
    expect(
      violations,
      "Raw process.exit() found — use exitProcess() from core/process/exit.ts",
    ).toEqual([]);
  });
});
