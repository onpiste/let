# ADR 0001: npm-workspaces monorepo with a shared contract package

- Status: accepted
- Date: 2026-10-27
- Superseded in part by [ADR 0002](0002-bun.md) (package manager)

## Context

The project started as a single Vite app: the Worker and the React client
lived side by side in `src/`, and the client imported server modules
(`./server`, `./auth`, `./telegram`) for types. That works for one client,
but a browser extension and an iOS app are planned. Each new client would
either copy types or import server code that pulls Worker-only modules into
its type graph.

## Decision

1. **npm workspaces** (`apps/*`, `packages/*`). npm was already in use, so
   the lockfile, CI cache and Cloudflare tooling keep working. No task
   runner yet; root scripts fan out with `--workspaces`. Add Turborepo when
   there are enough workspaces for caching to matter.
2. **`apps/server`** (Worker) and **`apps/web`** (React) are separate
   workspaces with separate dependencies and tsconfigs (the Worker compiles
   without the DOM lib; the client without Worker types).
3. **`packages/shared`** holds the contract both sides compile against:
   route constants, the `AssistantRpc` interface (which the server's
   `Assistant` implements), server events, settings types and validation.
   It is consumed as TypeScript source, with no build step.
4. **One deploy unit.** The Cloudflare Vite plugin in `apps/web` builds the
   client and the `apps/server` Worker together and deploys them as one
   Worker, so the SPA, auth and agent WebSockets share an origin and the
   session cookie needs no CORS or `SameSite=None`.
5. **Boundaries are lint rules**, not conventions: `no-restricted-imports`
   overrides stop clients importing the server and keep `@cot/shared` free
   of runtime-specific dependencies.
6. **Strict, automated quality gates**: oxfmt (with import, Tailwind and
   `package.json` sorting), type-aware oxlint with `--deny-warnings`, strict
   `tsc` presets in `@cot/tsconfig`, a pre-commit hook, and CI running all
   of them plus `wrangler types --check` and a build.

## Consequences

- Durable Object class names, the Worker name and bindings are unchanged, so
  existing data and the production deployment carry over.
- `apps/web` has a devDependency on `@cot/server` purely for the build;
  source imports are still forbidden by lint.
- `wrangler` commands that read config (`secret put`, `types`, `tail`) run
  from `apps/server`; `deploy` runs from `apps/web` (via `npm run deploy`)
  because it deploys the Vite build output.
- Splitting deployment later (separate assets host, more Workers) only
  changes build config, not the source layout.
