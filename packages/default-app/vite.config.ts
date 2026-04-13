import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const tunnelBase = process.env.TUNNEL_BASE;

/**
 * In tunnel mode, Vite's @vite/client is loaded not only via the script tag
 * but also by transformed CSS modules that import { createHotContext,
 * updateStyle, removeStyle } from "/@vite/client". Stripping the tag is
 * insufficient. Serve a no-op stub instead so the client never opens a
 * WebSocket but CSS injection still works.
 */
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
  plugins: [tailwindcss(), react(), ...(tunnelBase ? [stubHmrClient] : [])],
  server: {
    port: Number.parseInt(process.env.PORT || "5173"),
    hmr: tunnelBase ? false : undefined,
  },
});
