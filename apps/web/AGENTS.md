# apps/web — AGENTS.md

The React web client. Root rules in [/AGENTS.md](../../AGENTS.md) apply.

## Layout

```
index.html            Vite entry (theme bootstrap script, fonts)
public/               Static files served as-is
src/
  main.tsx            Mounts <App />
  app.tsx             Sign-in, harness switch, chat UI
  pages/              Full-page views (settings-page.tsx)
  lib/                Non-UI client code (auth.ts: /auth/* calls)
  styles.css          Theme tokens and component styles (Tailwind v4)
vite.config.ts        Builds this client *and* the apps/server Worker (Cloudflare plugin)
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
- Accessibility rules (`jsx-a11y`) are errors: label inputs, give icon
  buttons an `aria-label`, use `type="button"` for non-submit buttons.
