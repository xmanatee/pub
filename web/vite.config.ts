import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Dev middleware to serve sandbox files at /__sandbox__/ for local development.
 * In production, sandbox.pub.blue is a separate subdomain routed by Vercel.
 */
function sandboxDevPlugin(): Plugin {
  const sandboxDir = resolve(__dirname, "public/sandbox");
  return {
    name: "pub-sandbox-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__sandbox__/")) return next();
        const subPath = req.url.slice("/__sandbox__/".length).split("?")[0];
        // Map /__sandbox__/__canvas__/* to bootstrap index.html
        if (subPath.startsWith("__canvas__/")) {
          const html = readFileSync(resolve(sandboxDir, "index.html"), "utf-8");
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
          return;
        }
        // Serve static sandbox files (sw.js, index.html)
        const filePath = resolve(sandboxDir, subPath || "index.html");
        try {
          const content = readFileSync(filePath);
          if (subPath === "sw.js") {
            res.setHeader("Content-Type", "application/javascript");
            res.setHeader("Service-Worker-Allowed", "/__sandbox__/");
          } else {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
          }
          res.end(content);
        } catch {
          res.statusCode = 404;
          res.end("Not found");
        }
      });
    },
  };
}

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
    sandboxDevPlugin(),
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
