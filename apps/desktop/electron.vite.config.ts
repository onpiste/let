import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

// The dev server injects CSS as inline <style> tags and talks to its HMR
// client over a WebSocket, both of which the strict CSP in index.html blocks.
// Loosen it for `dev` only; the built app keeps the strict policy.
const devCsp: Plugin = {
  name: "cot-dev-csp",
  apply: "serve",
  transformIndexHtml: (html) =>
    html.replace(
      "style-src 'self'",
      "style-src 'self' 'unsafe-inline'; connect-src 'self' ws:"
    )
};

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
    plugins: [react(), devCsp]
  }
});
