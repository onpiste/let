import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import agents from "agents/vite";
import { defineConfig } from "vite";

// The web app and the server Worker are separate workspaces, but they ship
// as one Worker (static assets + API on the same origin). The Cloudflare
// plugin builds the Worker from apps/server alongside this client, and runs
// it in workerd during `vite dev`.
export default defineConfig({
  plugins: [
    agents(),
    react(),
    cloudflare({ configPath: "../server/wrangler.jsonc" }),
    tailwindcss()
  ]
});
