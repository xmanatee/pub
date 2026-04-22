import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vitest/config";

function rawMd(): Plugin {
  return {
    name: "raw-md",
    transform(_code, id) {
      if (!id.endsWith(".md")) return null;
      const text = readFileSync(id, "utf-8");
      return { code: `export default ${JSON.stringify(text)};`, map: null };
    },
  };
}

/**
 * Mirrors the bun-compile `import x from "./foo.tar.gz" with { type: "file" }`
 * semantics by exporting the absolute source path. Tests exercise the extract
 * helper with their own fixture tarball, so the embedded path itself is only
 * loaded to satisfy the module graph.
 */
function fileAsset(): Plugin {
  return {
    name: "file-asset",
    transform(_code, id) {
      if (!id.endsWith(".tar.gz")) return null;
      return { code: `export default ${JSON.stringify(id)};`, map: null };
    },
  };
}

export default defineConfig({
  plugins: [rawMd(), fileAsset()],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
