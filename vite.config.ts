import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icons/icon-180.png"],
      manifest: {
        name: "武蔵ドリル",
        short_name: "武蔵ドリル",
        description: "電車の往復で1〜2周。教習所ソフト「武蔵」方式の暗記ドリル。",
        theme_color: "#1e3a5f",
        background_color: "#0f1e33",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,json}"],
      },
    }),
  ],
});
