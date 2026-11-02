# scripts/devlog

The command-line side of Cot's unified logs. How to use them is in the
[dev-logs skill](../../.agents/skills/dev-logs/SKILL.md); this folder is the
code.

- `index.ts`: entry point. `bun run logs …` reads; `report` sends a failure.
- `read.ts`: queries the Workers Logs API for lines marked `"cot": 1` and
  prints them as NDJSON `LogEntry`s.
- `report.ts`: runs a build step, and on failure posts it (plus the
  file/line of each recognised error) to the Worker's `/dev/logs` with
  `DEV_LOGS_TOKEN`.
- `config.ts`: the Worker name, account and domain from
  `apps/server/wrangler.jsonc`, overridable with `CLOUDFLARE_ACCOUNT_ID` and
  `COT_URL`.
