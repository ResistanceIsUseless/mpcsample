import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Does not load tailwindcss or vite-plugin-dts — those are only needed for library builds.
export default defineConfig({
  plugins: [react()],
  test: {
    watch: false,
    globals: true,
    environment: "jsdom",
    css: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    // Vitest 4 + threads pool has a race where setupFiles are not loaded in
    // every worker. `fileParallelism: false` keeps test files in sequence
    // within a single worker — deterministic, ~5s vs ~3s parallel.
    fileParallelism: false,
    pool: "forks",
    coverage: {
      reportsDirectory: "./test-output/vitest/coverage",
      provider: "v8",
    },
  },
});
