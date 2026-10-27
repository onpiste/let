# apps/web — AGENTS.md

The React web client. Root rules in [/AGENTS.md](../../AGENTS.md) apply.

## Layout

```
index.html                Vite entry (theme bootstrap script, fonts)
public/                   Static files served as-is
src/
  main.tsx                Mounts <App />
  app.tsx                 Session state and page switching
  components/             UI shared by pages (brand, icons, theme toggle)
  pages/
    sign-in-page.tsx
    chat/                 chat-page (state + agent socket), message-list, composer,
                          empty-state, tool-chip, thinking, harness-switch, notice-toast
    settings/             settings-page + one file per card (assistant, mcp, integrations, email)
  lib/                    Non-UI code: auth, assistant RPC, harness storage, notifications
  styles/                 index.css imports tokens, base, topbar, layout, chat, settings in order
vite.config.ts            Builds this client *and* the apps/server Worker (Cloudflare plugin)
```

## Rules

- Import server-facing types, paths and RPC signatures from `@cot/shared`
  only. Never import from `@cot/server` (lint-enforced). It is a
  devDependency here only because this workspace's Vite build bundles it.
- Call the assistant through `AssistantRpc`; don't call `agent.stub.x()`
  with ad-hoc casts.
- Server messages outside the chat stream are `ServerEvent`s; parse them
  defensively (they arrive as untyped JSON).
- Keep fetch/WebSocket logic in `src/lib/` and UI in components so a future
  React client (e.g. the browser extension) can lift `lib/` into a shared
  package.
- Wrap `localStorage` access in `try/catch`; it throws in some private modes.
- A page component owns its agent socket and state; child components take
  props and callbacks. Add a new card or panel as its own file.
- Tailwind scans Streamdown's bundles through `@source` paths in
  `styles/index.css`, relative to that file and pointing at the repository
  root `node_modules` (`bunfig.toml` sets the hoisted linker). Update them if either moves.
- Accessibility rules (`jsx-a11y`) are errors: label inputs, give icon
  buttons an `aria-label`, use `type="button"` for non-submit buttons.
