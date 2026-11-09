# ADR 0005: A closed release loop

- Status: accepted
- Date: 2026-11-09

## Context

Every push to `main` deploys, and coding agents write much of the code.
[ADR 0004](0004-dev-logs.md) put every log in one place, but nothing read
it unless someone asked: a deploy that broke sign-in stayed live until a
user complained, production errors were only found by looking, and a fixed
bug could come back unnoticed.

## Decision

Close the loop with four small pieces on top of the dev logs, all in the
repository and on services a deployment already has (Cloudflare, GitHub):

1. **Versioned deploys.** The Deploy workflow tags the Worker version with
   the git sha (`version_metadata` binding). `/dev/health` reports it and
   every server log line carries it as `version`.
2. **Smoke test, then roll back.** After deploying, `bun run smoke` waits
   for the new sha and checks the public routes from outside. On failure
   the workflow runs `wrangler rollback` and opens a `deploy-failed` issue,
   which the next successful deploy closes.
3. **A watcher that files issues.** The Watch workflow reads error-level
   logs every half hour, groups them by a fingerprint that survives ids and
   deploys (`groupErrors` in `@cot/shared`), and keeps one `prod-error`
   issue per problem. The issue body holds the watcher's state, so there is
   no database. An error that returns after its issue was closed reopens it
   as a `regression`.
4. **A runbook agents follow** (`.agents/skills/release-loop`): reproduce in
   a test, fix, close the issue from the commit, verify after the deploy.
   `FIX_AGENT_MENTION` can hand new issues to an agent automatically.

Alerts are GitHub's own issue notifications, plus an optional chat webhook.

## Alternatives

- **A Worker cron that watches itself**: no runner minutes, but it needs a
  GitHub token in the Worker, and a broken Worker can't report itself.
- **Sentry or another error tracker**: better grouping and alerting, but a
  third-party account and key; Cot should work without extra keys. A fork
  that outgrows this can add one and keep the rest of the loop.
- **Preview deploys per pull request, smoke-tested before merge**: the
  Worker's custom domain, OAuth redirect and remote bindings make previews
  costly to set up in a fork. The smoke test runs after the deploy instead,
  and the rollback bounds the damage.

## Consequences

- A bad deploy is live for about a minute before it is rolled back. A
  Durable Object migration can't be rolled back; the issue says so and the
  fix goes forward.
- Errors are noticed within about half an hour, not instantly, and only if
  they are logged at `error`.
- Issue text comes from logs, so it is scrubbed (`publicSample`): no
  emails, no `data` beyond the error. Error messages must not carry chat
  text.
- The Watch workflow costs runner minutes in a private fork (about a minute
  per run); its `cron` can be made sparser.
