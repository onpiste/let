# scripts/ops

The scripts behind the release loop: deploy, smoke test, watch production
errors, file them as issues. How to use it is in the
[release-loop skill](../../.agents/skills/release-loop/SKILL.md), why in
[ADR 0005](../../docs/adr/0005-release-loop.md); this folder is the code.

- `index.ts`: entry point (`smoke`, `errors`, `watch`, `deploy-failed`,
  `deploy-ok`).
- `smoke.ts`: `bun run smoke`. Waits for `/dev/health` to report the
  deployed sha, then checks the public routes. Add a check to `CHECKS` for
  every new public route.
- `errors.ts`: `bun run errors` prints production errors grouped by
  `groupErrors` (`@cot/shared`); `watch` sends the same groups to
  `issues.ts`. `--from file.ndjson` reads saved `bun run logs` output
  instead of the API, which is also how to try a change here.
- `issues.ts`: one GitHub issue per problem: open, update counts, reopen
  as a regression, or stay muted.
- `issue-body.ts`: the issue text and the state kept in its body.
- `deploy.ts`: the `deploy-failed` issue, opened by a failed Deploy run and
  closed by the next good one.
- `github.ts`: the GitHub REST calls, with the workflow's `GITHUB_TOKEN`.
- `notify.ts`: the optional `ALERT_WEBHOOK_URL` alert and the
  `FIX_AGENT_MENTION` line.

Reading logs and reporting build failures is `../devlog`.
