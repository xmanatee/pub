import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "convex/**/*.test.ts",
      "shared/**/*.test.ts",
      "packages/super-app/src/features/reader/**/*.test.ts",
    ],
    exclude: ["node_modules/**", ".worktrees/**"],
    environment: "node",
  },
});
