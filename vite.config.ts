import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The backend's CORS config doesn't allow the Vite origin, so all API
    // traffic goes through this same-origin proxy in local dev.
    proxy: {
      "/api": { target: "http://nomad.local:8000", changeOrigin: true },
    },
  },
});
