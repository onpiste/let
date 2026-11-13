import { deployFailed, deploySucceeded } from "./deploy";
import { listErrors, watchErrors } from "./errors";
import { smoke } from "./smoke";

// The release loop's commands. See .agents/skills/release-loop/SKILL.md.
//   bun run smoke [--url https://…] [--version <sha>] [--wait 90]
//   bun run errors [--since 1d] [--source server,web,ios] [--from file.ndjson]
//   bun scripts/ops/index.ts watch [--since 2h]       (Watch workflow)
//   bun scripts/ops/index.ts deploy-failed|deploy-ok  (Deploy workflow)
const [command = "", ...args] = process.argv.slice(2);
const commands: Record<string, (args: string[]) => Promise<void>> = {
  smoke,
  errors: listErrors,
  watch: watchErrors,
  "deploy-failed": deployFailed,
  "deploy-ok": deploySucceeded
};
const run = commands[command];
if (!run) {
  process.stderr.write(
    `Usage: bun scripts/ops/index.ts <${Object.keys(commands).join("|")}>\n`
  );
  process.exit(2);
}
await run(args);
