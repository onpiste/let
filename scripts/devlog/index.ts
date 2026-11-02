import { readLogs } from "./read";
import { report } from "./report";

// Cot's developer-mode logs. See .agents/skills/dev-logs/SKILL.md.
//   bun run logs [--since 1h] [--source ios] [--level warn] [--grep text]
//   bun scripts/devlog report <step> -- <command…>
const [command, ...args] = process.argv.slice(2);
await (command === "report"
  ? report(args)
  : readLogs(command ? [command, ...args] : args));
