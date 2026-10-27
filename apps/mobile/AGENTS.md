# apps/mobile — AGENTS.md

The Capacitor iOS and Android shells. Root rules in
[/AGENTS.md](../../AGENTS.md) apply; see [README.md](README.md) for what they
do and how to build them.

- **No UI here.** The apps load the deployed web app; features go in
  `apps/web` and call device APIs from `apps/web/src/lib/` behind
  `isNativeApp`, always with a browser fallback. Branch on
  `Capacitor.getPlatform()` only where iOS and Android really differ.
- **Generated files.** `ios/App/CapApp-SPM/Package.swift` and
  `android/capacitor.settings.gradle` are written by `cap sync`; never edit
  them by hand. The other `sync` outputs are gitignored.
- **Hand-written native code**: `ios/App/App/` (`WebAuthPlugin.swift`,
  `BridgeViewController.swift`, `Info.plist`) and
  `android/app/src/main/AndroidManifest.xml`. A new Swift file must also be
  added to `ios/App/App.xcodeproj/project.pbxproj` (Xcode does this for you).
- The `Mobile` workflow builds both apps: iOS on macOS, Android on Linux.
