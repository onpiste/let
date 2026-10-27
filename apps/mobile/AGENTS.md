# apps/mobile — AGENTS.md

The Capacitor iOS shell. Root rules in [/AGENTS.md](../../AGENTS.md) apply;
see [README.md](README.md) for what it does and how to build it.

- **No UI here.** The app loads the deployed web app; features go in
  `apps/web` and call device APIs from `apps/web/src/lib/` behind
  `isNativeApp`, always with a browser fallback.
- **Generated files.** `ios/App/CapApp-SPM/Package.swift` is written by
  `cap sync`; never edit it by hand. `ios/App/App/public`,
  `capacitor.config.json` and `config.xml` are gitignored outputs of `sync`.
- **Hand-written native code** lives in `ios/App/App/` (`WebAuthPlugin.swift`,
  `BridgeViewController.swift`, `Info.plist`). A new Swift file must also be
  added to `ios/App/App.xcodeproj/project.pbxproj` (Xcode does this for you).
- Swift can't be built on Linux; the `iOS` workflow builds it on macOS.
