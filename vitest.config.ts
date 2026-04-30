import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "packages/super-app/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
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
