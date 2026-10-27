# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. Read
this first; the workspace-level `AGENTS.md` files add rules for their own
directory.

## What this is

Cot is a personal AI assistant on the Cloudflare Agents SDK. One Cloudflare
Worker serves the web app and the API; each signed-in account gets its own
Durable Object agents (chat history, memory, reminders, settings).

## Repository layout

npm workspaces monorepo. Deployables live in `apps/`, reusable code in
`packages/`.

```
apps/
  server/     @cot/server  Cloudflare Worker: HTTP router, auth, Durable Object agents, tools
  web/        @cot/web     React SPA; its Vite build also bundles the server Worker and deploys both
packages/
  shared/     @cot/shared  Runtime-agnostic contract: types, route constants, RPC interface, pure logic
  tsconfig/   @cot/tsconfig Strict TypeScript presets (base / react / worker)
docs/
  architecture.md          Layers, boundaries, how to add a client (extension, iOS, …)
  adr/                     Architecture decision records
```

Future clients go in `apps/` as new workspaces (`apps/extension`, `apps/ios`).
See [docs/architecture.md](docs/architecture.md#adding-a-client) before adding
one.

## Commands

Run from the repository root.

| Command                | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| `npm install`          | Install every workspace (also installs the git hooks)     |
| `npm run dev`          | Web app + Worker in workerd at http://localhost:5173      |
| `npm run check`        | Format check + type-aware lint + typecheck (what CI runs) |
| `npm run format`       | Format everything with oxfmt                              |
| `npm run lint`         | oxlint, type-aware; any warning fails                     |
| `npm run lint:fix`     | Apply safe lint fixes                                     |
| `npm run typecheck`    | `tsc` in every workspace                                  |
| `npm run build`        | Production build of client + Worker                       |
| `npm run types`        | Regenerate `apps/server/env.d.ts` from `wrangler.jsonc`   |
| `npm run deploy`       | Build and deploy to Cloudflare                            |
| `npm run <s> -w <pkg>` | Run a script in one workspace, e.g. `-w @cot/server`      |

There is no test suite yet. When adding one, use Vitest
(`@cloudflare/vitest-pool-workers` for the server) and wire it into
`npm run check` and CI.

## Definition of done

Before you commit, all of these must pass. CI runs the same steps and blocks
the merge otherwise:

1. `npm run check` — no format diffs, **zero** lint warnings, no type errors.
2. `npm run build` succeeds.
3. If you changed `apps/server/wrangler.jsonc` or renamed/moved an exported
   Durable Object class, run `npm run types` and commit `env.d.ts`
   (CI checks it with `wrangler types --check`).

A pre-commit hook (husky + lint-staged) formats and lints staged files.
Don't bypass it with `--no-verify`.

## Architecture rules

These are enforced by `no-restricted-imports` in `.oxlintrc.json`; don't
work around them with relative paths.

- **`@cot/shared` is the only thing clients and server share.** It must stay
  runtime-agnostic: no `cloudflare:*`, `agents`, `@cloudflare/*`, React or
  `node:*` imports. Anything a second client would need (types, route paths,
  RPC signatures, validation) belongs here.
- **Clients never import server code.** `apps/web` talks to the server only
  over HTTP/WebSocket, using `AUTH_ROUTES`, `HARNESSES` and the
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
sorted `package.json`). Never hand-format; run `npm run format`.

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
code. Keep modules small and single-purpose (see the server layout in
`apps/server/AGENTS.md`).

## Local setup and secrets

- Secrets for `npm run dev` go in `apps/server/.dev.vars` (copy
  `apps/server/.dev.vars.example`). Never commit `.dev.vars`.
- Production secrets are set with `npx wrangler secret put <NAME>` from
  `apps/server` and survive deploys.
- `npm run dev` starts the sandbox container, which needs Docker. Without
  Docker, set `"dev": { "enable_containers": false }` in a local copy of the
  config, or expect the sandbox tools to fail.
- Workers AI, AI Search and Browser Rendering bindings are remote; run
  `npx wrangler login` once.

## Git

- Small, focused commits with an imperative subject ("Add …", "Fix …").
- Don't commit build output (`dist/`, `.wrangler/`) or `node_modules/`.
- Pushing to `main` deploys to production (`.github/workflows/deploy.yml`).
