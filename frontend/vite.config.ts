import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const apiTarget = process.env.PULSE_API_PROXY || "http://localhost:3001";
const proxy = {
  "/api": { target: apiTarget, changeOrigin: true },
  "/socket.io": { target: apiTarget, ws: true },
};

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@supabase/")) return "supabase";
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "pulse-icon.svg",
        "pulse-icon-192.png",
        "pulse-icon-512.png",
        "pulse-maskable-512.png",
        "apple-touch-icon.png",
        "pulse-og.png",
        "pulse-grain.svg",
        "fonts/unbounded-latin.woff2",
      ],
      manifest: {
        id: "/",
        name: "Pulse — Blind test",
        short_name: "Pulse",
        description: "Blind test musical et cinéma, en solo ou entre amis.",
        theme_color: "#171515",
        background_color: "#171515",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        lang: "fr",
        categories: ["games", "music", "entertainment"],
        icons: [
          {
            src: "/pulse-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/pulse-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pulse-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pulse-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(?:e-cdns-images|cdn-images)\.dzcdn\.net\//,
            handler: "CacheFirst",
            options: {
              cacheName: "covers",
              expiration: { maxEntries: 80, maxAgeSeconds: 7 * 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { host: true, proxy },
  preview: { proxy },
});
