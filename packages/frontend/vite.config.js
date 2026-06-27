import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    allowedHosts: true,
    // Proxy API calls to the backend during dev so there are no CORS issues.
    proxy: {
      "/api": "http://localhost:8080",
      "/health": "http://localhost:8080",
      "/oauth": "http://localhost:8080",
      "/webhooks": "http://localhost:8080",
    },
  },
  build: {
    // Single embeddable bundle keeps the GHL Custom-JS install simple.
    outDir: "dist",
  },
});
