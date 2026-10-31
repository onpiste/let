# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. Read
this first; the workspace-level `AGENTS.md` files add rules for their own
directory.

## What this is

Cot is a **template for a personal AI assistant**, in the spirit of Muse and
OpenClaw, that an individual or a small/medium business can fork, brand and
deploy quickly. It is built on the Cloudflare Agents SDK: one Cloudflare
Worker serves the web app and the API, and each signed-in account gets its
own Durable Object agents (chat history, memory, reminders, settings).

## Product goals

Keep these in mind when deciding how to build something:

- **Forkable first.** Someone who clones this should get a working assistant
  after setting secrets, a name and a domain. Keep deployment-specific values
  (domain, names, allow-lists, API bases) in `wrangler.jsonc`, secrets or
  `DEFAULT_SETTINGS`, not scattered through code. If you add a new one,
  document it in the README's "Make it yours" or setup sections.
- **Per-user by default.** Everything a user configures (model and keys,
  persona, MCP servers, bots) is stored in their own Durable Object and set
  from the settings page, not in deployment config. One deployment must serve
  a person, a family or a small team without code changes.
- **Private and owned.** Data stays in the deployer's Cloudflare account.
  Secrets never go back to the browser in full; the Worker, not the client,
  decides which assistant a request reaches.
- **Extensible along known seams.** New capabilities are tools
  (`apps/server/src/agents/think/tools/`) or MCP servers; new messengers follow
  `integrations/telegram/`; new clients go in `apps/` against
  `@cot/shared`. Prefer extending a seam over special-casing.
- **Works with no extra keys.** Workers AI is the default model; features that
  need a third-party key or service must degrade gracefully without it.
- **A clean example to learn from.** This is a starting point people read and
  copy, so the strict rules below matter more than usual.

## Repository layout

Bun workspaces monorepo. Deployables live in `apps/`, reusable code in
`packages/`.

```
apps/
  server/     @cot/server  Cloudflare Worker: HTTP router, auth, Durable Object agents, tools
  web/        @cot/web     React SPA; its Vite build also bundles the server Worker and deploys both
  desktop/    @cot/desktop Electron tray app: local MCP bridge (calendar, files, CLIs) reached through Cloudflare Tunnel
  mobile/     (Swift)      Native SwiftUI iOS app; talks to the Worker over HTTP/WebSocket, not a Bun workspace
packages/
  shared/     @cot/shared  Runtime-agnostic contract: types, route constants, RPC interface, pure logic
  tsconfig/   @cot/tsconfig Strict TypeScript presets (base / react / worker)
docs/
  architecture.md          Layers, boundaries, how to add a client (extension, iOS, …)
  adr/                     Architecture decision records
```

Future clients go in `apps/` as new workspaces (e.g. `apps/extension`).
See [docs/architecture.md](docs/architecture.md#adding-a-client) before adding
one.

## Commands

Run from the repository root.

| Command                      | What it does                                               |
| ---------------------------- | ---------------------------------------------------------- |
| `bun install`                | Install every workspace (also installs the git hooks)      |
| `bun run dev`                | Web app + Worker in workerd at http://localhost:5173       |
| `bun run check`              | Format, lint, typecheck and dead-code check (what CI runs) |
| `bun run format`             | Format everything with oxfmt                               |
| `bun run lint`               | oxlint, type-aware; any warning fails                      |
| `bun run lint:fix`           | Apply safe lint fixes                                      |
| `bun run typecheck`          | `tsc` in every workspace                                   |
| `bun run knip`               | Find unused files, exports and dependencies                |
| `bun run test`               | Vitest unit tests (`@cot/shared` pure logic)               |
| `bun run build`              | Production build of client + Worker                        |
| `bun run types`              | Regenerate `apps/server/env.d.ts` from `wrangler.jsonc`    |
| `bun run deploy`             | Build and deploy to Cloudflare                             |
| `bun run --filter <pkg> <s>` | Run a script in one workspace, e.g. `--filter @cot/server` |

Tests use Vitest and run as part of `bun run check`. Only `@cot/shared` has
them so far (pure logic, e.g. `approval.test.ts`); add
`@cloudflare/vitest-pool-workers` when the server needs its own.

## Definition of done

Before you commit, all of these must pass. CI runs the same steps on pull
requests, and the Deploy workflow on pushes to `main`:

1. `bun run check` — no format diffs, **zero** lint warnings, no type errors,
   passing tests, no dead code (knip: unused files, exports, types or dependencies). Delete
   dead code rather than ignoring it; a genuine exception goes in
   `knip.jsonc` with a comment saying why.
2. `bun run build` succeeds.
3. If you changed `apps/server/wrangler.jsonc` or renamed/moved an exported
   Durable Object class, run `bun run types` and commit `env.d.ts`
   (CI checks it with `wrangler types --check`).

A pre-commit hook (husky + lint-staged) formats and lints staged files, and a
pre-push hook runs `bun run check` (plus SwiftFormat/SwiftLint when
`apps/mobile` changed). Don't bypass them with `--no-verify`.

### CI minutes

Workflows use standard GitHub-hosted runners, which are free for public
repositories; don't switch to larger or third-party runners, which are billed.
A fork kept private pays for minutes, macOS ones most; it can move the slow
checks to a Mac with `scripts/nightly.sh` (desktop build, iOS lint and tests,
optional TestFlight upload), run three times a day after
`scripts/nightly.sh --install`.

## Web and iOS parity

The web app (`apps/web`) and the iOS app (`apps/mobile`) are first-class
clients and must offer the same features. A user-facing change (chat
behavior, attachments, settings, model choices, tool UI) ships for both in
the same change; don't land it on one and leave the other behind. If the
other client genuinely can't support it yet, say so in the commit message and
in `apps/mobile/README.md`, and note the gap rather than hiding it.

They should also **look alike**. Keep the rough layout and styling of each
screen the same on both: the same controls in the same order and places
(e.g. the composer is a round attach button, then a pill holding the text
and one trailing button that is a mic while empty and send/stop otherwise),
similar shapes, sizes and spacing, and the same colour roles. Each platform
may use its native widgets, fonts and icons; it may not rearrange the
screen. When you change the layout on one client, change the other in the
same commit, and say in a comment which counterpart a component mirrors
(e.g. `composer.tsx` ↔ `ComposerView.swift`).

## Architecture rules

These are enforced by `no-restricted-imports` in `.oxlintrc.json`; don't
work around them with relative paths.

- **`@cot/shared` is the only thing clients and server share.** It must stay
  runtime-agnostic: no `cloudflare:*`, `agents`, `@cloudflare/*`, React or
  `node:*` imports. Anything a second client would need (types, route paths,
  RPC signatures, validation) belongs here.
- **Clients never import server code.** `apps/web` talks to the server only
  over HTTP/WebSocket, using `AUTH_ROUTES`, `ASSISTANT` and the
  `AssistantRpc` interface from `@cot/shared`.
- **The server never imports client code** (no React, no `@cot/web`).
- **Cross-workspace imports use the package name** (`@cot/shared`), never a
  path like `../../packages/shared/src`.
- **Changing a callable**: update `AssistantRpc` in
  `packages/shared/src/rpc.ts` first. `Assistant implements AssistantRpc`, so
  the server and every client fail to typecheck until they agree.
- **Durable Object classes are persistent state.** Never rename or remove an
  exported DO class or its binding without a `migrations` entry in
  `wrangler.jsonc`; the class name is what links a deployment to its data.

## Code style

Formatting is fully automated (oxfmt: 80 columns, 2 spaces, double quotes,
semicolons, no trailing commas, sorted imports, sorted Tailwind classes,
sorted `package.json`). Never hand-format; run `bun run format`.

TypeScript runs with `strict`, `noUncheckedIndexedAccess`,
`noImplicitOverride`, `noUnusedLocals/Parameters` and
`verbatimModuleSyntax`. In practice:

- Use `import type` / inline `type` specifiers for type-only imports.
- Mark overridden members of SDK base classes with `override`.
- No `any`, no non-null `!`. Narrow with checks; cast only at a trust
  boundary (JSON parse, untyped SDK stub) and say why in a comment.
- No floating promises. `await` them, or mark fire-and-forget with `void`.
  JSX event handlers must not return promises: `onClick={() => void save()}`.
- Interpolate unknown errors with `String(error)`.
- Switches over unions are exhaustive (or have an explicit `default`).
- Prefix intentionally unused parameters with `_`.

To silence a lint rule on one line, use
`// oxlint-disable-next-line <rule> -- <reason>`. Don't disable rules
file-wide or loosen `.oxlintrc.json` to make a change pass.

Comments explain _why_, not _what_; match the density of the surrounding
code.

### File size

One module, one job. Lint fails any TS/TSX file over **300 lines** (blank
lines and comments excluded); aim for well under 200. Split by
responsibility, not by line count:

- **React**: one component per file, grouped by page or feature
  (`pages/chat/composer.tsx`). Shared UI goes to `components/`, non-UI logic
  (fetch, storage, formatting) to `lib/`.
- **Durable Object classes** stay thin: lifecycle hooks and callables that
  delegate. Storage goes in a `store.ts`, prompts in `system-prompt.ts`,
  tools in `tools/<group>.ts`, integrations in a channel class (see
  `apps/server/src/agents/think/`).
- **CSS**: one file per area under `apps/web/src/styles/`, imported in
  cascade order from `index.css`.
- When a folder gains three or more files about one integration or feature,
  give it a short `README.md` (see `integrations/telegram/README.md`).

## Local setup and secrets

- Secrets for `bun run dev` go in `apps/server/.dev.vars` (copy
  `apps/server/.dev.vars.example`). Never commit `.dev.vars`.
- Production secrets are set with `bunx wrangler secret put <NAME>` from
  `apps/server` and survive deploys.
- `bun run dev` starts the sandbox container, which needs Docker. Without
  Docker, set `"dev": { "enable_containers": false }` in a local copy of the
  config, or expect the sandbox tools to fail.
- Workers AI, AI Search and Browser Rendering bindings are remote; run
  `bunx wrangler login` once.

## Git

- Small, focused commits with an imperative subject ("Add …", "Fix …").
- Don't commit build output (`dist/`, `.wrangler/`) or `node_modules/`.
- Commit and push straight to `main`; don't create feature branches or PRs
  unless asked. Run the definition-of-done checks first, because a push to
  `main` deploys to production (`.github/workflows/deploy.yml`).
