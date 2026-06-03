import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("reader raw iframe sandbox", () => {
  it("does not combine srcDoc content with allow-same-origin", async () => {
    const page = await readFile(join(import.meta.dirname, "page.tsx"), "utf8");
    expect(page).not.toMatch(/srcDoc=\{current\.html\}[\s\S]*allow-same-origin/);
  });
});
