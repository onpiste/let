import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iOS app is a native shell around the deployed web app: the WebView
 * loads the Worker's own origin, so the session cookie, /auth/* and the agent
 * WebSockets work exactly as in a browser, and Capacitor injects its bridge
 * so the page can call device APIs (see apps/web/src/lib/native.ts).
 *
 * Forks: set `appId` to a bundle id you own and `server.url` to your domain
 * (the `routes` pattern in apps/server/wrangler.jsonc). For local testing
 * against `bun run dev`, use your machine's LAN address with `cleartext`.
 */
const config: CapacitorConfig = {
  appId: "runlet.GoodMenu",
  appName: "CotBot",
  // Shown only if the server can't be reached; the app itself is remote.
  webDir: "www",
  server: {
    url: "https://runlet.us",
    // Google sign-in runs in the system browser (SFSafariViewController),
    // never in the WebView, which Google blocks.
    allowNavigation: ["runlet.us"]
  },
  // The `cot://` URL scheme native sign-in returns to is registered in
  // ios/App/App/Info.plist (CFBundleURLTypes).
  // "never": the web app pads itself with env(safe-area-inset-*); an
  // automatic native inset on top of that makes the page taller than the
  // screen (stray scrollbar) and clips the notch area.
  ios: { contentInset: "never" },
  plugins: {
    LocalNotifications: { presentationOptions: ["banner", "sound"] }
  }
};

export default config;
