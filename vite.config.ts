import * as path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig(({ command }) => {
  const isLibBuild = command === "build" && process.env.BUILD_TARGET !== "web";

  return {
    root: __dirname,
    plugins: [
      react(),
      tailwindcss(),
      ...(isLibBuild
        ? [
            dts({
              entryRoot: "src",
              tsconfigPath: path.join(__dirname, "tsconfig.lib.json"),
            }),
          ]
        : []),
    ],
    server: {
      port: 4404,
    },
    build: isLibBuild
      ? {
          outDir: "./dist",
          emptyOutDir: true,
          reportCompressedSize: true,
          commonjsOptions: {
            transformMixedEsModules: true,
          },
          lib: {
            entry: "src/index.ts",
            name: "mpcsample",
            fileName: "index",
            formats: ["es" as const],
          },
          rollupOptions: {
            external: ["react", "react-dom", "react/jsx-runtime"],
          },
        }
      : {
          outDir: "./dist-dev",
        },
  };
});
