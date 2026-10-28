# apps/mobile — AGENTS.md

The native iOS app (SwiftUI). Root rules in [/AGENTS.md](../../AGENTS.md)
apply; see [README.md](README.md) for what it does and how to build it.

- **Not a Bun workspace.** There is no `package.json`; `bun run check` never
  sees this folder. The `iOS` workflow builds and tests it on macOS.
- **Swift can't be built on Linux.** Keep changes small and let CI be the
  compiler; run the tests in Xcode (⌘U) when you have a Mac.
- **Lint and format with SwiftFormat + SwiftLint** (`brew install swiftformat
  swiftlint`). Run `swiftformat .` then `swiftlint lint --strict` in this
  folder before committing; the `iOS` workflow runs both. Config is in
  `.swiftformat` and `.swiftlint.yml`; SwiftFormat owns formatting, so keep
  style rules out of SwiftLint.
- **The Xcode project is generated.** `project.yml` (XcodeGen) is the source;
  `Cot.xcodeproj` and `Cot/Info.plist` are gitignored outputs. A new Swift
  file under `Cot/` or `CotTests/` needs no project edit.
- **Deployment values live in `project.yml`** (`CotServerURL`,
  `CotRedirectURI`, bundle id), read through `Cot/Core/Config.swift`. Never
  hard-code a domain in Swift.
- **The contract is `@cot/shared`.** The Swift types in `Cot/Settings/SettingsTypes.swift`
  and `Cot/Core/User.swift` mirror it by hand. When you change `packages/shared` (a route, an
  `AssistantRpc` method, a settings field), update them in the same change.
- **Layout.** `Core/` is networking and auth (no SwiftUI), `Chat/` the chat
  protocol, reducer and views, `Settings/` the settings sheet. Views stay
  thin: protocol and state logic goes in a store/model that tests can drive.
- **Chat messages stay raw JSON** (`JSONValue`) so the whole history can be
  sent back unchanged; read them through the accessors on `ChatMessage`.
