import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.TUNNEL_BASE || "/",
  plugins: [tailwindcss(), react()],
  server: {
    port: Number.parseInt(process.env.PORT || "5173"),
  },
});
