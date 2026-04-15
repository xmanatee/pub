import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";

const tunnelBase = process.env.TUNNEL_BASE;

export default defineConfig({
  base: tunnelBase || "/",
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../../shared"),
      util: path.resolve(__dirname, "src/core/util-shim.ts"),
      // gramjs pulls in `socks` for optional SOCKS proxy support; we use WSS
      // and never configure a proxy, so the module can be a noop in-browser.
      socks: path.resolve(__dirname, "src/core/empty-module.ts"),
    },
  },
  server: {
    port: Number.parseInt(process.env.PORT || "5173", 10),
    hmr: tunnelBase ? false : undefined,
  },
  plugins: [tailwindcss(), tanstackStart({ target: "node-server" })],
});
