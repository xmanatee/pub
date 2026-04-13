import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const tunnelBase = process.env.TUNNEL_BASE;

/** Strip @vite/client in tunnel mode — HMR is not available through the relay. */
const stripHmrClient = {
  name: "strip-hmr-client",
  transformIndexHtml: {
    order: "post" as const,
    handler(html: string) {
      return html.replace(/<script type="module" src="\/@vite\/client"><\/script>\n?/, "");
    },
  },
};

export default defineConfig({
  base: tunnelBase || "/",
  plugins: [tailwindcss(), react(), ...(tunnelBase ? [stripHmrClient] : [])],
  server: {
    port: Number.parseInt(process.env.PORT || "5173"),
    hmr: tunnelBase ? false : undefined,
  },
});
