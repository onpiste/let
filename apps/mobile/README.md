# Cot for iOS and Android (`@cot/mobile`)

A [Capacitor](https://capacitorjs.com) shell: native iOS and Android apps
whose WebView loads the deployed web app (`server.url` in
`capacitor.config.ts`) and gives it device APIs. There is no separate UI to
maintain; changes to `apps/web` reach the apps on the next deploy without a
store release.

## What's native

| Capability             | iOS                                                            | Android                                                          |
| ---------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| Google sign-in         | `ios/App/App/WebAuthPlugin.swift` (ASWebAuthenticationSession) | Custom Tab (`@capacitor/browser`) + deep link (`@capacitor/app`) |
| Reminder notifications | `@capacitor/local-notifications`                               | same                                                             |
| Haptics                | `@capacitor/haptics`                                           | same                                                             |

The web side lives in `apps/web/src/lib/` (`native.ts`, `native-auth.ts`,
`notifications.ts`).

Google blocks sign-in inside embedded WebViews, so the apps sign in in the
system browser. The Worker redirects to `cot://auth/callback?code=…`, and the
page exchanges the code (with its PKCE verifier) at `/auth/token`, which sets
the WebView's session cookie. See `NATIVE_AUTH_PARAMS` in `@cot/shared` and
`apps/server/src/auth/native.ts`.

## Build and run

```bash
bun install                                  # from the repo root
bun run --filter @cot/mobile sync            # generates the gitignored native files
bun run --filter @cot/mobile open:ios        # Xcode 16+ on macOS
bun run --filter @cot/mobile open:android    # Android Studio
```

- **iOS:** in Xcode, pick your team under **Signing & Capabilities**, choose a
  simulator or device and press Run.
- **Android:** in Android Studio, press Run; or from `android/`,
  `./gradlew assembleDebug` builds `app/build/outputs/apk/debug/app-debug.apk`
  (needs JDK 21 and the Android SDK).

Run `sync` again after adding or upgrading a Capacitor plugin.

The apps load the production Worker, so the server changes they rely on
(`/auth/token`, `NATIVE_REDIRECT_URI`) must be deployed first. To point them
at `bun run dev` instead, temporarily set `server.url` to
`http://<your-LAN-ip>:5173` with `cleartext: true`, and run `sync`.

## Make it yours

- `appId` and `appName` in `capacitor.config.ts`; the bundle id in Xcode and
  `applicationId`/`namespace` in `android/app/build.gradle` (plus the
  `MainActivity` package).
- `server.url` / `allowNavigation`: your domain (`routes` in
  `apps/server/wrangler.jsonc`).
- URL scheme: `CFBundleURLSchemes` in `ios/App/App/Info.plist`, the
  `intent-filter` in `android/app/src/main/AndroidManifest.xml`,
  `NATIVE_REDIRECT_URI` in `apps/server/wrangler.jsonc` and `REDIRECT_URI` in
  `apps/web/src/lib/native-auth.ts` must all agree.
- Icons and splash: `ios/App/App/Assets.xcassets`, `android/app/src/main/res`.

## Adding a device capability

1. `bun add @capacitor/<plugin>` in **both** `apps/web` (the JS API the page
   calls) and `apps/mobile` (so `cap sync` links its native code), and list
   it under `apps/mobile` in `knip.jsonc`.
2. Call it from `apps/web/src/lib/`, behind `isNativeApp` with a browser
   fallback.
3. Add any permission or usage description it needs (camera, location, …) to
   `Info.plist` and `AndroidManifest.xml`, then `sync`.

Plugins written for this app only go in `ios/App/App/` (registered in
`BridgeViewController.swift`, like `WebAuthPlugin`) or in
`android/app/src/main/java/` (registered in `MainActivity`).
