---
name: release-loop
description: Ship a change to Cot without regressions and fix what breaks in production. Use when shipping a feature or fix to main, when a deploy or its smoke test failed, when working on a GitHub issue labelled prod-error, regression or deploy-failed, and whenever someone asks "is production healthy", "what's failing in prod", "did the deploy work" or "fix this production error".
---

# Release loop

Every change goes round one loop, and each step feeds the next:

```
 change ──▶ check + tests ──▶ deploy ──▶ smoke test ──▶ production
   ▲          (pre-push, CI)   (main)     fails: roll back    │
   │                                      + deploy-failed     ▼
   └── fix + regression test ◀── prod-error issue ◀── Watch (every 30 min)
        (this skill)              + alert              groups error logs
```

| Step    | What runs                                             | Where                           |
| ------- | ----------------------------------------------------- | ------------------------------- |
| Check   | `bun run check`, `bun run build`                      | pre-push hook, `ci.yml`         |
| Deploy  | `wrangler deploy --tag <sha>`                         | `deploy.yml`, on push to `main` |
| Smoke   | `bun run smoke --version <sha>`; failure rolls back   | `deploy.yml`, `scripts/ops`     |
| Collect | one JSON log format, server lines carry the sha       | the `dev-logs` skill            |
| Watch   | error logs → `prod-error` issues, alerts, regressions | `watch.yml`, `scripts/ops`      |
| Fix     | reproduce in a test, fix, verify, close the issue     | you, with the runbooks below    |

## Commands

```sh
bun run smoke                       # is production up? (public routes, no sign-in)
bun run smoke --url http://localhost:5173
bun run errors --since 1d           # production errors grouped into problems
bun run logs --since 1d --grep <requestId>   # the story behind one of them
```

`bun run errors` prints one JSON line per problem, most frequent first:
`fingerprint`, `source`, `scope`, `title`, `count`, `users`, `firstSeen`,
`lastSeen`, `versions` (the deployed shas it was seen on) and a `sample`
with a `requestId` or `session` to grep for. It and `bun run logs` need
`CLOUDFLARE_API_TOKEN` (see the `dev-logs` skill); `bun run smoke` needs
nothing.

## Shipping a change

Before pushing:

1. **Tests for the logic you added.** Pure logic goes in `@cot/shared` with
   a `*.test.ts` next to it; `bun run check` runs them.
2. **A log line where it can fail**: `log.error(scope, msg, error)` on the
   server, `devLog.error` / `DevLog.error` in the clients. An error that
   isn't logged is invisible to the Watch workflow.
3. **A smoke check for a new public route** or a new way the Worker can
   fail to start: add it to `CHECKS` in `scripts/ops/smoke.ts`. Smoke checks
   never sign in and never write.
4. `bun run check` and `bun run build` pass.

After it lands on `main`:

5. The Deploy workflow deploys, waits for `/dev/health` to report the new
   sha and runs the smoke test. Nothing to do when it is green.
6. Half an hour later, `bun run errors --since 1h`: a group whose
   `versions` holds only your sha may be yours, but an hour of logs can't
   show that. Check that it doesn't also appear before your deploy
   (`bun run errors --since <a time before it, ISO>`, or its issue's
   history). If it doesn't, fix it now, while the change is fresh, rather
   than waiting for the issue.

## Runbook: a `prod-error` or `regression` issue

1. **Read the issue.** The table says how often and since which version;
   the sample has the error and a `requestId` or `session`.
2. **Get the story**: `bun run logs --since 1d --grep <requestId>`, then
   `--grep <session>` for what the client did before. Find the code from
   `scope` (table in the `dev-logs` skill). `versions` only lists the shas
   seen in the window the watcher read, so it narrows the search but does
   not prove which deploy introduced the error: check the issue's history
   and older logs before blaming a change (`git show <sha> --stat`).
3. **Reproduce it in a test first.** Move the failing logic into
   `@cot/shared` if it is pure and isn't there yet. The test must fail
   before the fix and pass after; it is what keeps this from coming back.
   If it truly can't be tested (a platform or third-party failure), say why
   in the commit message.
4. **Fix the cause**, not the log line. If the error is expected and
   handled (a user's bad API key, a network drop), handle it and log it at
   `warn`, so it stops counting as a production error.
5. `bun run check && bun run build`, commit with `Refs #<issue>` (not
   `Fixes`, which would close the issue before step 6 has verified the
   deploy), and push following the Git rules in `AGENTS.md`.
6. **Verify** after the deploy: check that the Deploy workflow for the
   fix's commit succeeded, then run `bun run smoke --version <sha>`, with
   the fix's sha or, if a later commit has deployed since, that commit's
   (check `git merge-base --is-ancestor <fix sha> <live sha>`). Without
   `--version` the smoke check can pass against the previous healthy
   deployment. Note the time the fix went live, wait half an hour, then
   check that `bun run errors --since <that time, ISO>` no longer lists the
   fingerprint. The query reads at most 2,000 lines before it filters them
   and prints groups, not a raw count, so it can't show it was cut short:
   a missing fingerprint is a hint, not proof. Close only after the
   original failure no longer reproduces on the live build. Client lines carry the device's clock, so
   a client error close to the deploy time proves little either way: check
   its `version`. Only Worker lines carry the deployed git sha. iOS lines
   carry the app's build number and web lines carry no `version` at all,
   so treat a client line as inconclusive and confirm on a build you know
   includes the fix before closing. Then close it as completed
   (`gh issue close <issue> --reason completed`), so a later return reopens
   it as a `regression`.

For a `regression` issue the earlier fix did not hold: read the previous
fix (linked from the issue's history) before writing another, and step 3
is not optional.

How the issues behave (`scripts/ops/issues.ts`):

- More occurrences of an open issue only update its counts.
- Closing as **completed** re-arms it: the same error 30 minutes or more
  after closing reopens it with the `regression` label and an alert.
- Closing as **not planned** mutes that error for good. Use it for noise
  you can't fix (a browser extension's errors), not for real bugs.

## Runbook: a `deploy-failed` issue

1. `bun run logs --source ci --since 1d --level error`; the newest
   `session` is the failed run. Entries with `data.file` point at lines to
   fix, the step entry's `data.output` has the rest, `data.runUrl` the run.
2. If the step was **Smoke**, production was rolled back to the previous
   version (unless the issue says otherwise). The output names each failed
   check; reproduce with `bun run dev` and
   `bun run smoke --url http://localhost:5173`.
3. If the rollback itself failed (a Durable Object migration can't be
   rolled back), production is broken now: fix forward on `main` first,
   investigate after.
4. Push the fix to `main`. The next successful deploy closes the issue.

## Setup (once per deployment)

| What                                                              | Needed for              | Without it                    |
| ----------------------------------------------------------------- | ----------------------- | ----------------------------- |
| `CLOUDFLARE_API_TOKEN` secret with _Workers Observability_ access | Watch, `bun run errors` | Watch runs but does nothing   |
| `DEV_LOGS_TOKEN` secret (see `dev-logs`)                          | CI failures in the logs | failures only show in Actions |
| `ALERT_WEBHOOK_URL` secret                                        | chat alerts             | GitHub's issue emails only    |
| `FIX_AGENT_MENTION` variable                                      | an agent starts the fix | a person assigns the issue    |
| `AUTO_ROLLBACK` variable = `off`                                  | no automatic rollback   | failed smoke test rolls back  |

- `ALERT_WEBHOOK_URL` gets `{"text": …, "content": …}`: a Slack or Discord
  incoming webhook works as is, and so does Telegram's
  `https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>`.
- `FIX_AGENT_MENTION` (e.g. `@claude`, with that agent's GitHub App
  installed) is added to new and reopened issues, asking it to follow this
  skill.
- Issues are written from `publicSample` (`packages/shared/src/log-groups.ts`):
  no account emails, no log `data` beyond the error. Keep chat text out of
  error messages, because they end up in issues.
- GitHub pauses scheduled workflows after 60 days without a commit, and a
  private fork pays for Watch's minutes: change its `cron` to run less often.
