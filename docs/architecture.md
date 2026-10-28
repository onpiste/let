# Architecture

## Overview

```
                ┌───────────────────────── one Cloudflare Worker (runlet.us) ─────────────────────────┐
 Browser ──────►│ static assets (apps/web build)                                                      │
 (apps/web)     │                                                                                     │
       │        │ http/router.ts ── /auth/*  ──► auth/google.ts (session cookie)                      │
       │ WS/HTTP│                ── /chat/*  ──► Assistant DO   (Think)  ─┐ per account: google:<sub> │
       └───────►│                ── /pi/*    ──► PiAssistant DO (Pi)   ──┤ memory shared over RPC    │
 Telegram ─────►│                ── /messengers/telegram/* ──► TelegramRoutes DO ──► Assistant DO     │
 Email ────────►│ email handler ── <alias>@runlet.us ──► EmailAddresses DO ──► Assistant DO (inbox)   │
                │                                                                                     │
                │ tools/: Sandbox DO (container) · Dynamic Worker code runner · Browser Rendering      │
                └─────────────────────────────────────────────────────────────────────────────────────┘
```

## Layers and dependency direction

```
apps/web ──────┬──► packages/shared ◄─── apps/server
apps/extension ┘
apps/mobile ──► native Swift client; speaks the same HTTP/WebSocket contract
```

- **`packages/shared`** is the contract: route paths, the assistant endpoint, the
  `AssistantRpc` callable interface, server events, settings types and
  validation. Runtime-agnostic, no dependencies.
- **`apps/server`** implements the contract. `Assistant implements
AssistantRpc`, so a signature drift is a compile error.
- **Clients** (`apps/web` today) depend on the contract only. They reach the
  server over HTTP and the agent WebSocket, never by importing it.

Lint (`no-restricted-imports` overrides in `.oxlintrc.json`) enforces each
arrow; reversing one fails CI.

## Build and deploy unit

Code is split by workspace, but the web client and the Worker ship together
as **one Worker** so the SPA, `/auth/*` and the agent WebSockets share an
origin (the session cookie is `SameSite=Lax`, `HttpOnly`).

`apps/web/vite.config.ts` points the Cloudflare Vite plugin at
`apps/server/wrangler.jsonc`. One `vite build` produces `dist/client` (assets)
and `dist/cot_assistant` (Worker + generated `wrangler.json`), and
`wrangler deploy` in `apps/web` uploads both. In dev, the same plugin runs the
Worker in workerd behind Vite's dev server. See
[ADR 0001](adr/0001-monorepo-layout.md) for why.

If the client ever needs to deploy separately (e.g. a CDN, or a second web
app), give `apps/server` its own Vite config with only the Cloudflare plugin
and point `assets.directory` at the client's build output; nothing in the
source layout has to change.

## Adding a client

### Common steps

1. Create `apps/<name>` with a `package.json` named `@cot/<name>` and a
   `tsconfig.json` extending a preset from `@cot/tsconfig`.
2. Depend on `@cot/shared` (`"@cot/shared": "*"`) and import routes, RPC
   types and settings logic from it. Do not copy them.
3. Add a lint override in `.oxlintrc.json` for `apps/<name>/**` that bans
   `@cot/server` and `cloudflare:*`, like the `apps/web/src/**` one.
4. Add an `AGENTS.md` for the workspace and a row to the layout table in the
   root `AGENTS.md`.
5. Add its build to CI (`bun run --filter @cot/<name> build`).

### Browser extension (`apps/extension`)

- Manifest V3, built with Vite (e.g. WXT or CRXJS) and React, so it can reuse
  `@cot/shared` directly. When it needs the same UI pieces as `apps/web`,
  extract them into `packages/ui` (and `apps/web/src/lib` into
  `packages/client`) instead of importing across apps.
- Requests to `https://runlet.us` with `host_permissions` carry the session
  cookie, so the existing Google sign-in works: open `AUTH_ROUTES.login` in a
  tab, then call `AUTH_ROUTES.me`.
- Add new server paths it needs to `@cot/shared/routes.ts` and to
  `assets.run_worker_first`.

### iOS (`apps/mobile`)

- A native SwiftUI app, not a Bun workspace: it can't import `@cot/shared`,
  so the few types it needs (`User`, settings) are mirrored
  by hand in Swift and must change together with the contract. It reaches the
  server only over HTTP and the agent WebSocket, like the web client.
- Sign-in is the native flow: `ASWebAuthenticationSession` → `/auth/login`
  with a PKCE challenge → `cot://auth/callback?code=…` → `POST /auth/token`,
  which returns a bearer token (`NATIVE_AUTH_PARAMS` in `@cot/shared`,
  `apps/server/src/auth/native.ts`). The token is sent as
  `Authorization: Bearer` on HTTP and on the WebSocket upgrade;
  `getUserFromRequest` accepts it.
- Chat and settings use the Agents SDK WebSocket protocol directly
  (`cf_agent_*` chat frames, `{type:"rpc"}` for `AssistantRpc`). See
  [apps/mobile/README.md](../apps/mobile/README.md).

## Adding server capabilities

See [apps/server/AGENTS.md](../apps/server/AGENTS.md): tools go in
`src/tools`, channels in `src/integrations`, callables in `AssistantRpc`
first, new Durable Objects need a migration.
