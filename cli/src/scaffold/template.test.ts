import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATE_FILES } from "./template.js";

const PACKAGE_DIR = path.resolve(__dirname, "../../../packages/default-app");

describe("template sync", () => {
  const templatePaths = Object.keys(TEMPLATE_FILES).sort();

  it("embedded template files match packages/default-app/", () => {
    for (const relPath of templatePaths) {
      const filePath = path.join(PACKAGE_DIR, relPath);
      expect(fs.existsSync(filePath), `missing file: ${relPath}`).toBe(true);

      const onDisk = fs.readFileSync(filePath, "utf-8");
      const embedded = TEMPLATE_FILES[relPath];

      if (relPath.endsWith(".json")) {
        expect(JSON.parse(embedded), `JSON mismatch: ${relPath}`).toEqual(JSON.parse(onDisk));
      } else {
        expect(embedded, `content mismatch: ${relPath}`).toBe(onDisk);
      }
    }
  });

  it("packages/default-app/ has no extra source files", () => {
    const packageFiles = collectFiles(PACKAGE_DIR)
      .map((f) => path.relative(PACKAGE_DIR, f).replace(/\\/g, "/"))
      .filter((f) => !f.startsWith("node_modules/") && !f.startsWith("."))
      .sort();

    expect(packageFiles).toEqual(templatePaths);
  });
});

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      results.push(...collectFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}
