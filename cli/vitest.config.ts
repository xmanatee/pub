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

export default defineConfig({
  plugins: [rawMd()],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
