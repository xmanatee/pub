import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { commandsPlugin } from "./src/commands/middleware";

const tunnelBase = process.env.TUNNEL_BASE;

const stubHmrClient = {
  name: "stub-hmr-client",
  configureServer(server: {
    middlewares: {
      use: (handler: (req: { url?: string }, res: unknown, next: () => void) => void) => void;
    };
  }) {
    const stub = `export function createHotContext() {
  return {
    accept() {}, acceptExports() {}, dispose() {}, prune() {},
    invalidate() {}, decline() {}, on() {}, off() {}, send() {},
  };
}
export function updateStyle(id, css) {
  let el = document.querySelector('style[data-vite-dev-id="' + id + '"]');
  if (!el) {
    el = document.createElement("style");
    el.setAttribute("data-vite-dev-id", id);
    document.head.appendChild(el);
  }
  el.textContent = css;
}
export function removeStyle(id) {
  const el = document.querySelector('style[data-vite-dev-id="' + id + '"]');
  if (el) el.remove();
}
`;
    server.middlewares.use((req, res, next) => {
      if (req.url && /\/@vite\/client(?:$|\?)/.test(req.url)) {
        const r = res as { setHeader: (k: string, v: string) => void; end: (b: string) => void };
        r.setHeader("Content-Type", "application/javascript");
        r.setHeader("Cache-Control", "no-cache");
        r.end(stub);
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  base: tunnelBase || "/",
  plugins: [
    tailwindcss(),
    react(),
    commandsPlugin(),
    ...(tunnelBase ? [stubHmrClient] : []),
  ],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: Number.parseInt(process.env.PORT || "5173"),
    hmr: tunnelBase ? false : undefined,
  },
});
