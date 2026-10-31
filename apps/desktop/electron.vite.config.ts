import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

// The main process bundles every dependency, including the workspace package
// @cot/shared (TypeScript source), so the installer ships no node_modules.
// Only Electron and Node built-ins stay external.
export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: { input: { index: "src/main/index.ts" } }
    }
  },
  preload: {
    build: {
      // A sandboxed renderer only runs a CommonJS preload script.
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
        output: { format: "cjs", entryFileNames: "[name].cjs" }
      }
    }
  },
  renderer: {
    root: "src/renderer",
    build: {
      rollupOptions: { input: { index: "src/renderer/index.html" } }
    },
    plugins: [react()]
  }
});
