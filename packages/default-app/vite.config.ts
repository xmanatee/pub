import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const tunnelBase = process.env.TUNNEL_BASE;

export default defineConfig({
  base: tunnelBase || "/",
  plugins: [tailwindcss(), react()],
  server: {
    port: Number.parseInt(process.env.PORT || "5173"),
    hmr: tunnelBase ? false : undefined,
  },
});
