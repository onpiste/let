# apps/desktop — AGENTS.md

The desktop tray app. Root rules in [/AGENTS.md](../../AGENTS.md) apply. See
[README.md](README.md) for what it does and how users run it.

## Layout

```
electron-builder.yml      Installers (dmg, nsis, AppImage) and macOS usage strings
electron.vite.config.ts   Main bundles every dependency; preload is CommonJS
resources/                Tray and app icons
src/
  shared/api.ts           State and API types shared by main, preload and window
  main/
    index.ts              App lifecycle, tray, window
    controller.ts         Owns the bridge, tunnel and Cot link; builds the state
    ipc.ts                Window → main calls, with input checks
    tunnel.ts             cloudflared process and its public URL
    cloudflared.ts        Finds or downloads cloudflared (checksum-verified)
    vault.ts              Token and URL secret, encrypted with safeStorage
    json-store.ts         Settings files (policy.json, prefs.json)
    cot/                  Sign-in (loopback + PKCE), agent WebSocket RPC, registration
    bridge/               The MCP server: policy, tools/, calendar/
  preload/index.ts        The only bridge between window and main
  renderer/               Settings window: one file per card
```

## Rules

- **Security boundary is the policy.** Nothing a tool call sends may change
  `policy.json`, the secret or the vault. Only `ipc.ts` handlers do, and they
  validate every value (`sanitizePolicy`).
- **Every file tool resolves paths with `resolveInRoots`**; every process goes
  through `bridge/proc.ts`. No POSIX-only paths or shell syntax: macOS, Windows
  and Linux all run this.
- **Model text never becomes code.** Calendar scripts (JXA, PowerShell) read
  their arguments from the `COT_ARGS` environment variable (`calendar/script.ts`).
- Tools return failures as text (`failure()`), never throw. Register them with
  `defineTool` so calls show up in the activity log.
- The renderer has no Node access and a strict CSP; it talks to main only
  through `window.cot` (`DesktopApi`).
- It never imports `@cot/server`; it reaches Cot only over HTTP/WebSocket with
  `@cot/shared`.
