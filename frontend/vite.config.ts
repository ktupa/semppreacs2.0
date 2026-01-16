import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      // GenieACS NBI
      "/api-genie": {
        target: "http://localhost:7557",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-genie/, ""),
      },

      // UI do Genie (se você usa login via UI)
      "/genie-ui": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/genie-ui/, ""),
      },

      // FastAPI Bridge (diagnóstico, IXC, TR-069)
      "/diagnostico": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI IXC
      "/ixc": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI TR-069 Normalizer
      "/api/tr069": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI Config (periodic-inform, system stats, etc.)
      "/config": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI Analytics
      "/analytics": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI Integrations
      "/integrations": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI Metrics
      "/metrics": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI Auth (JWT)
      "/auth": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI Feeds (webhooks, alerts, ingest)
      "/feeds": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI ML (Machine Learning)
      "/ml": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI Webhook
      "/webhook": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI Backup & Restore
      "/backup": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // Debug do FastAPI
      "/__debug": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI Genie proxy (bridge to GenieACS)
      "/genie": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI Device Parameters (TR-069)
      "/devices": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },

      // FastAPI Provisioning (auto-config)
      "/provisioning": {
        target: "http://127.0.0.1:8087",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
