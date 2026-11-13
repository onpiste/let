---
name: dev-logs
description: Read Cot's unified logs (Worker, web app, iOS app, local builds and CI) to find out why something failed. Use when debugging any bug, crash, error message, failed request, broken socket, missing push notification, or a failed build, check, test, deploy or CI run, and whenever someone asks "why did X fail", "check the logs" or "what happened".
---

# Dev logs

Every part of Cot writes one JSON format to one place, Cloudflare Workers
Logs, and `bun run logs` reads it back. Use it before guessing.

| Source   | What writes it                                                       |
| -------- | -------------------------------------------------------------------- |
| `server` | the Worker and its Durable Objects (`apps/server/src/log/logger.ts`) |
| `web`    | the browser app (`apps/web/src/lib/dev-log.ts`) via `/dev/logs`      |
| `ios`    | the iOS app (`apps/mobile/Cot/Core/DevLog.swift`) via `/dev/logs`    |
| `build`  | a failed local step: pre-push `bun run check`, `scripts/nightly.sh`  |
| `ci`     | a failed GitHub Actions step (CI, Deploy, iOS workflows)             |

Developer mode (`DEV_LOGS: "on"` in `apps/server/wrangler.jsonc`) is on by
default: it adds `debug`/`info` server lines and makes the web and iOS apps
send theirs. Warnings and errors from the server, and build/CI failures, are
always recorded.

## Read the logs

```sh
bun run logs                                  # last hour, everything
bun run logs --since 1d --level error         # 15m, 2h, 1d or an ISO date
bun run logs --source ci --since 1d           # server, web, ios, build, ci (comma-separated)
bun run logs --grep <requestId|session|text>  # full-text, e.g. to follow one request
bun run logs --limit 50
```

Output is NDJSON, oldest first, one `LogEntry` per line; pipe it to `jq`
when it is long, e.g. `bun run logs --since 1d | jq -c 'select(.data.file)'`.
Exit code 2 means `CLOUDFLARE_API_TOKEN` is missing (see Setup).

## The format (`packages/shared/src/logs.ts`)

```json
{
  "ts": "2026-11-01T10:00:00.000Z",
  "level": "warn",
  "source": "ios",
  "scope": "socket",
  "msg": "Socket closed",
  "user": "a@b.c",
  "session": "…",
  "requestId": "…",
  "chatId": "…",
  "version": "42",
  "data": { "path": "/chat", "failures": "2" }
}
```

- `level`: debug < info < warn < error. `scope`: the area (table below).
- `user` is set by the server from the session; a client can't fake it.
- `session` groups one page load / app launch / CI run; `requestId` joins a
  client's request with the server's lines for it.
- `version` on a `server` line is the git sha that deploy was built from
  (set by the Deploy workflow), so an error can be pinned to a release.
- Errors carry `data.error` = `{name, message, stack}`.
- A `build`/`ci` failure is one entry with `data.step`, `command`,
  `exitCode`, `branch`, `runUrl` (CI) and `output` (the last 200 lines),
  plus one entry per recognised error line (tsc, oxlint, vitest, Swift)
  with `data.file` and `data.line`, and `version` = the git sha.

## Runbooks

For production errors as a whole (`bun run errors`, the `prod-error` issues
the Watch workflow files, a failed deploy), see the `release-loop` skill.

**A build, check or CI run failed.**

1. `bun run logs --source ci,build --since 1d --level error`.
2. Take the newest `session` (one run). Its entries with `data.file` point
   straight at the lines to fix; the step entry's `data.output` has the rest
   and `data.runUrl` links the run.
3. Fix, then re-run that step locally (`bun run check`, `bun run build`, or
   the command in `data.command`) until it passes.

**Something misbehaved in the app.**

1. Reproduce it, or get the time it happened from the user.
2. `bun run logs --since 30m --level warn` for the overview; drop `--level`
   for the full story around it.
3. Follow one request or client with `--grep <requestId>` or
   `--grep <session>`; filter one person with `--grep <email>`.
4. Find the code from `scope` (below), fix it, and add a log line where the
   trail went cold so the next look is shorter.

| `scope`                             | Where                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `http`                              | `apps/server/src/http/router.ts`, `apps/web/src/lib/dev-log.ts` (`tracedFetch`)                    |
| `chat`                              | `apps/server/src/agents/think/chat.ts`, `history.ts`                                               |
| `research`                          | `apps/server/src/agents/think/research-jobs.ts`                                                    |
| `apns`, `webpush`                   | `apps/server/src/integrations/{apns,webpush}/`, `apps/mobile/Cot/Core/Push.swift`                  |
| `telegram`, `email`                 | `apps/server/src/integrations/{telegram,email}/`                                                   |
| `socket`                            | `apps/web/src/pages/chat/chat-page.tsx`, `chat-pane.tsx`, `apps/mobile/Cot/Core/AgentSocket.swift` |
| `auth`                              | `apps/web/src/lib/auth.ts`, `apps/mobile/Cot/Core/AuthModel.swift`                                 |
| `notice`                            | an error the user saw: web toasts (`chat-page.tsx`), iOS `ChatStore.errorText`                     |
| `window`, `app`                     | uncaught browser errors; page load / app launch                                                    |
| step names, `tsc`, `lint`, `vitest` | build and CI reports (`scripts/devlog/report.ts`)                                                  |

## Adding a log line

Never use raw `console.log` or `print`; go through the logger so the line
keeps the format. Keep chat text, attachments and secrets out of `info` and
above (keys that look like secrets are masked anyway).

- Server: `import { log } from "…/log/logger"`, then
  `log.info("scope", "What happened", { detail })`,
  `log.error("scope", "What failed", error)`, or `log.with({ chatId })`.
- Web: `devLog.info(…)` / `devLog.error(scope, msg, error)` from
  `lib/dev-log.ts`; `tracedFetch` for HTTP calls.
- iOS: `DevLog.info("scope", "msg", ["key": "value"])`,
  `DevLog.error("scope", "msg", error)`.
- A new build step: run it through
  `bun scripts/devlog/index.ts report "<Step>" -- <command…>`.

Web and iOS should log the same events under the same scopes.

## Setup (once per deployment)

- **Reading** needs `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with
  _Workers Observability_ (edit) on the account in `wrangler.jsonc`. Put it
  in the environment of whatever agent or shell runs `bun run logs` (for a
  Claude Code cloud environment: its environment variables; its network
  policy must allow `api.cloudflare.com`). The Deploy workflow's token can be
  reused if it has that permission.
- **Build and CI reports** need `DEV_LOGS_TOKEN`, a shared secret:
  ```sh
  token=$(openssl rand -hex 32)
  (cd apps/server && echo "$token" | bunx wrangler secret put DEV_LOGS_TOKEN)
  gh secret set DEV_LOGS_TOKEN --body "$token"   # GitHub Actions
  ```
  and export it locally for pre-push and `scripts/nightly.sh` reports.
  `COT_URL` overrides the deployment the reports go to (default: the
  `routes` domain in `wrangler.jsonc`).
- `bun run dev` (local workerd) doesn't ship to Workers Logs; there the
  same JSON lines appear in the dev server's terminal.
- Workers Logs keeps lines for 3 days (free) or 7 (paid plans).
