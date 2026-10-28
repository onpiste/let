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

## TestFlight without a Mac

The **TestFlight** workflow (`.github/workflows/testflight.yml`) archives,
signs and uploads the app from a GitHub macOS runner. Install it on your
phone with the TestFlight app. One-time setup:

1. In [App Store Connect](https://appstoreconnect.apple.com), create an app
   with your bundle id (`appId` in `capacitor.config.ts`).
2. Under **Users and Access → Integrations → App Store Connect API**, create a
   team key with the **Admin** role (cloud-managed signing needs it) and
   download the `.p8` file; it can only be downloaded once.
3. Add the repository secrets `APPLE_TEAM_ID` (from developer.apple.com →
   Membership), `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID` and
   `APP_STORE_CONNECT_KEY` (the `.p8` file's contents).
4. Run the workflow from the **Actions** tab. Once App Store Connect has
   processed the build, add yourself under **TestFlight → Internal Testing**.

The build number is the workflow's run number; bump `MARKETING_VERSION` in
Xcode for a new version. Each run's runner creates a fresh Apple Development
certificate; revoke old ones on developer.apple.com if they pile up.

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
