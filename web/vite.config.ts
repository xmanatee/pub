import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  envDir: "..",
  server: {
    host: "127.0.0.1",
    port: 3000,
    proxy: {
      "/ph": {
        target: "https://eu.i.posthog.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ph/, ""),
      },
    },
  },
  build: {
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        manualChunks: {
          sentry: ["@sentry/react"],
          posthog: ["posthog-js"],
          backend: [
            "convex",
            "@convex-dev/auth/react",
            "@convex-dev/react-query",
            "@tanstack/react-router",
            "@tanstack/react-query",
          ],
          telegram: ["@telegram-apps/sdk-react"],
          icons: ["lucide-react", "@icons-pack/react-simple-icons"],
          eruda: ["eruda"],
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    TanStackRouterVite({ autoCodeSplitting: true }),
    viteReact(),
    // Sentry plugin must be last — uploads source maps on build
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        filesToDeleteAfterUpload: ["./dist/**/*.map"],
      },
      // Silently skip if credentials aren't configured
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
});
