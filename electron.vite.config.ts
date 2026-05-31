import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "electron/main.ts"),
      },
      rollupOptions: {
        output: {
          // Emit as index.js to match electron-builder extraMetadata.main = out/main/index.js
          entryFileNames: "index.js",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "electron/preload.ts"),
      },
      rollupOptions: {
        output: {
          // Force the preload to emit as index.js so main.ts can reference
          // "../preload/index.js" (standard electron-vite convention).
          entryFileNames: "index.js",
          format: "cjs",
        },
      },
    },
  },
  renderer: {
    root: ".",
    plugins: [react(), tailwindcss()],
    build: {
      // Relative base so assets resolve correctly when loaded via file://
      base: "./",
      outDir: "out/renderer",
      // The desktop app is directory-driven and never fetches the preset /kits
      // assets, so skip copying public/ (it holds ~296MB of preset WAVs that
      // would otherwise bloat out/renderer and the packaged app.asar).
      copyPublicDir: false,
      rollupOptions: {
        input: resolve(__dirname, "index.html"),
      },
    },
    server: {
      port: 4406,
    },
  },
});
