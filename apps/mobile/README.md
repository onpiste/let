# Cot for iOS (`@cot/mobile`)

A [Capacitor](https://capacitorjs.com) shell: a native iOS app whose WebView
loads the deployed web app (`server.url` in `capacitor.config.ts`) and gives
it device APIs. There is no separate UI to maintain; changes to `apps/web`
reach the app on the next deploy without an App Store release.

## What's native

| Capability             | Where                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Google sign-in         | `ios/App/App/WebAuthPlugin.swift` (ASWebAuthenticationSession) + `apps/web/src/lib/native-auth.ts` |
| Reminder notifications | `@capacitor/local-notifications`, from `apps/web/src/lib/notifications.ts`                         |
| Haptics                | `@capacitor/haptics`, from `apps/web/src/lib/native.ts`                                            |

Google blocks sign-in inside embedded WebViews, so the app signs in through
the system's web authentication sheet. The Worker redirects to
`cot://auth/callback?code=…`, and the page exchanges the code (with its PKCE
verifier) at `/auth/token`, which sets the WebView's session cookie. See
`NATIVE_AUTH_PARAMS` in `@cot/shared` and `apps/server/src/auth/native.ts`.

## Build and run (macOS)

Needs Xcode 16+.

```bash
bun install                            # from the repo root
bun run --filter @cot/mobile sync      # generates the gitignored native files
bun run --filter @cot/mobile open      # opens ios/App/App.xcodeproj in Xcode
```

In Xcode, pick your team under **Signing & Capabilities**, choose a simulator
or device and press Run. Run `sync` again after adding or upgrading a
Capacitor plugin.

The app loads the production Worker, so the server changes it relies on
(`/auth/token`, `NATIVE_REDIRECT_URI`) must be deployed first. To point it at
`bun run dev` instead, temporarily set `server.url` to
`http://<your-mac-LAN-ip>:5173` with `cleartext: true`, and run `sync`.

## Make it yours

- `appId` and `appName` in `capacitor.config.ts`, and the bundle id in Xcode.
- `server.url` / `allowNavigation`: your domain (`routes` in
  `apps/server/wrangler.jsonc`).
- URL scheme: `CFBundleURLSchemes` in `ios/App/App/Info.plist`,
  `NATIVE_REDIRECT_URI` in `apps/server/wrangler.jsonc` and `REDIRECT_URI` in
  `apps/web/src/lib/native-auth.ts` must all agree.
- Icon and splash: `ios/App/App/Assets.xcassets`.

## Adding a device capability

1. `bun add @capacitor/<plugin>` in **both** `apps/web` (the JS API the page
   calls) and `apps/mobile` (so `cap sync` links its native code), and list
   it under `apps/mobile` in `knip.jsonc`.
2. Call it from `apps/web/src/lib/`, behind `isNativeApp` with a browser
   fallback.
3. Add any usage description it needs (camera, location, …) to `Info.plist`,
   then `sync`.

Plugins written for this app only go in `ios/App/App/` and are registered in
`BridgeViewController.swift`, like `WebAuthPlugin`.
