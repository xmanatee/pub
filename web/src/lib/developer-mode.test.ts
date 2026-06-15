import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");

describe("developer mode production boundary", () => {
  it("does not ship Eruda in the production web bundle", async () => {
    const [source, viteConfig, packageJson] = await Promise.all([
      readFile(join(root, "src/lib/developer-mode.ts"), "utf8"),
      readFile(join(root, "vite.config.ts"), "utf8"),
      readFile(join(root, "package.json"), "utf8"),
    ]);

    const manifest = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(source).not.toMatch(/from ["']eruda["']/);
    expect(viteConfig).not.toContain("eruda");
    expect(manifest.dependencies).not.toHaveProperty("eruda");
  });
});
