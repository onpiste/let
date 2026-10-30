# Cot for iOS (`apps/mobile`)

A native SwiftUI client for the same assistant the web app talks to. It speaks
the server's own protocols (HTTP auth, the Agents SDK WebSocket) directly, so
there is no WebView: native text, keyboard, haptics and system sign-in.

| Feature                                                       | Where                                                |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| Google sign-in (system sheet, PKCE, bearer token)             | `Cot/Core/AuthModel.swift`                           |
| Reconnecting agent WebSocket + `AssistantRpc` calls           | `Cot/Core/AgentSocket.swift`                         |
| Chat: streaming, reasoning, tools, approvals                  | `Cot/Chat/` (`ChatStore`, `ChunkReducer`, views)     |
| Attach files and photos (text inline, images/PDF)             | `Cot/Chat/Attachment.swift`, `ComposerView.swift`    |
| Message queue: send while the assistant replies               | `Cot/Chat/QueuedView.swift`, `ChatStore` queue       |
| Scheduled tasks: list, pause, resume, delete, edit            | `Cot/Chat/TasksView.swift`, `ChatStore+Tasks.swift`  |
| Chat history: list, open, delete, new chat                    | `Cot/Chat/HistoryView.swift`, `ChatStore` history    |
| Settings: model and keys, skills, connectors, Telegram, email | `Cot/Settings/`                                      |
| Reminder and mail notices                                     | in-app banner; system notification when backgrounded |

Requires iOS 17 and Xcode 16+.

## How it connects

Sign-in is the native flow from `NATIVE_AUTH_PARAMS` in `@cot/shared`:
`ASWebAuthenticationSession` → `/auth/login` with a PKCE challenge →
`cot://auth/callback?code=…` → `POST /auth/token`, which returns a bearer
token. The token is kept in the Keychain and sent as `Authorization: Bearer`
on `/auth/me` and on the WebSocket upgrade to `/chat`.

Chat uses the Agents SDK frames (`cf_agent_use_chat_request`, `…_response`,
`…_chat_messages`, tool approval, stream resume); the settings page calls the
`AssistantRpc` methods as `{type:"rpc"}` frames. `ChatStore` is the single
place that interprets them.

## Build and run (macOS)

```bash
brew install xcodegen
cd apps/mobile
xcodegen generate        # writes Cot.xcodeproj from project.yml
open Cot.xcodeproj
```

Pick your team under **Signing & Capabilities**, choose a simulator or device
and press Run. Run `xcodegen generate` again after editing `project.yml`.
⌘U runs the unit tests (`CotTests`), which cover the stream reducer, the
message round trip and the Markdown reader.

The app talks to the production Worker by default. To use `bun run dev`
instead, set `CotServerURL` in `project.yml` to `http://<your-mac-LAN-ip>:5173`
(and allow cleartext HTTP for that host in an `NSAppTransportSecurity`
exception). The server needs `NATIVE_REDIRECT_URI` set (it is in
`apps/server/wrangler.jsonc`).

## TestFlight without a Mac

The **TestFlight** workflow (`.github/workflows/testflight.yml`) archives,
signs and uploads the app from a GitHub macOS runner. Install it on your
phone with the TestFlight app. One-time setup:

1. In [App Store Connect](https://appstoreconnect.apple.com), create an app
   with your bundle id (`PRODUCT_BUNDLE_IDENTIFIER` in `project.yml`).
2. Under **Users and Access → Integrations → App Store Connect API**, create a
   team key with the **Admin** role (cloud-managed signing needs it) and
   download the `.p8` file; it can only be downloaded once.
3. Add the repository secrets `APPLE_TEAM_ID` (from developer.apple.com →
   Membership), `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID` and
   `APP_STORE_CONNECT_KEY` (the `.p8` file's contents).
4. Run the workflow from the **Actions** tab. Once App Store Connect has
   processed the build, add yourself under **TestFlight → Internal Testing**.

The build number is the workflow's run number; bump `MARKETING_VERSION` in
`project.yml` for a new version.

### Manual signing (recommended)

By default each run's runner asks Apple for a fresh Development certificate,
and once the account's limit is reached the archive fails with "Your account
has reached the maximum number of certificates". To avoid that, sign every
build with one fixed distribution certificate. No Mac is needed; run this
anywhere with OpenSSL:

1. Make a key and certificate request, keeping `dist.key` private:
   `openssl genrsa -out dist.key 2048 && openssl req -new -key dist.key -out dist.csr -subj "/CN=Cot Distribution"`
2. On developer.apple.com → **Certificates** → **+** → **Apple Distribution**,
   upload `dist.csr` and download the certificate (`distribution.cer`).
3. Turn it into a `.p12` (the legacy ciphers are what macOS can import):
   `openssl x509 -inform der -in distribution.cer -out dist.pem && openssl pkcs12 -export -inkey dist.key -in dist.pem -out dist.p12 -certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES -macalg sha1`
   and choose a password when asked.
4. On developer.apple.com → **Profiles** → **+** → **App Store Connect**, pick
   your App ID (the bundle id) and that certificate, and download the
   `.mobileprovision`.
5. Add the repository secrets `IOS_DIST_CERT_P12` (`base64 -w0 dist.p12`, or
   `base64 -i dist.p12` on macOS), `IOS_DIST_CERT_PASSWORD` and
   `IOS_PROVISIONING_PROFILE` (`base64` of the `.mobileprovision`).

Once `IOS_DIST_CERT_P12` is set the workflow uses it; remove the secret to
go back to automatic signing. The certificate and profile last a year, so
renew them (repeat steps 2-5) before they expire.

## Make it yours

All in `project.yml`:

- `PRODUCT_BUNDLE_IDENTIFIER`, `CFBundleDisplayName`.
- `CotServerURL`: your Worker's origin (the `routes` pattern in
  `apps/server/wrangler.jsonc`).
- `CotRedirectURI` and the `CFBundleURLSchemes` entry: the URL scheme sign-in
  returns to. It must equal `NATIVE_REDIRECT_URI` in
  `apps/server/wrangler.jsonc`.
- Icon: `Cot/Assets.xcassets/AppIcon.appiconset`.

## Limitations

- Notices arrive over the WebSocket, so a reminder reaches the phone only
  while the app is running or recently backgrounded. Reliable background
  delivery needs APNs and a server-side push; not built yet.
- MCP servers that need OAuth must be authorized once in the web app: the
  OAuth callback is a web page that needs the browser's session cookie.
