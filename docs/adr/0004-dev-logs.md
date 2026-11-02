# ADR 0004: One log format in Workers Logs

- Status: accepted
- Date: 2026-11-02

## Context

Debugging meant `wrangler tail` for the Worker (free-form strings), browser
devtools, Xcode, and the GitHub Actions pages: five places, no shared
format, and nothing a coding agent could query on its own.

## Decision

1. **One format**, `LogEntry` in `packages/shared/src/logs.ts`, for every
   source: `server`, `web`, `ios`, `build`, `ci`.
2. **Workers Logs is the store.** The Worker prints each entry as one JSON
   line marked `"cot": 1`; Workers Logs indexes its fields. No Durable
   Object, database or third-party service to run, and it is already on
   (`observability.enabled`).
3. **Everything else goes through the Worker.** The apps post batches to
   `/dev/logs` with their session (the Worker sets `user`), builds and CI
   with the `DEV_LOGS_TOKEN` secret. Each entry is validated and redacted,
   then printed like a server line.
4. **A global switch**, `DEV_LOGS` in `wrangler.jsonc`, on by default:
   debug/info lines and the apps' logs only flow while it is on; warnings,
   errors and build failures always do.
5. **Agents read through a CLI** (`bun run logs`, NDJSON on stdout) and a
   repo skill (`.agents/skills/dev-logs`), so any coding agent can use it,
   not only one with a particular integration.

## Consequences

- Reading needs a Cloudflare API token with Workers Observability access.
- Retention is Workers Logs' (3 days free, 7 paid), and `bun run dev` logs
  stay in the local terminal.
- The apps' logs cost Workers requests and Logs volume while developer mode
  is on; a busy deployment can turn it off.
