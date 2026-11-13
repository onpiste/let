import { readFileSync } from "node:fs";

import { groupErrors, type LogEntry, normalizeLogEntry } from "@cot/shared";

import { config, parseFlags } from "../devlog/config";
import { MISSING_TOKEN, queryLogs } from "../devlog/read";
import { githubReady } from "./github";
import { syncIssues } from "./issues";

/**
 * Production errors, grouped into problems (`groupErrors` in @cot/shared).
 *
 * `bun run errors` prints one JSON `ErrorGroup` per line, most frequent
 * first, for a person or agent to read. `watch` is the same query run by
 * the Watch workflow, which files each problem as a GitHub issue.
 *
 *   --since 1d                 15m, 2h, 1d or an ISO date (default 1d)
 *   --source server,web,ios    which runtime sources count (the default)
 *   --from file.ndjson         read `bun run logs` output instead of the API
 */

const RUNTIME_SOURCES = "server,web,ios";

async function errorEntries(flags: Record<string, string>, since: string) {
  const sources = (flags.source || RUNTIME_SOURCES).split(",").filter(Boolean);
  if (flags.from) {
    return readFileSync(flags.from, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => normalizeWithUser(JSON.parse(line)))
      .filter((entry): entry is LogEntry => entry !== null)
      .filter((entry) => sources.includes(entry.source));
  }
  return queryLogs({
    since: flags.since || since,
    sources,
    level: "error",
    limit: 2000
  });
}

/** `normalizeLogEntry` drops `user`; a saved log file is trusted to set it. */
function normalizeWithUser(raw: unknown) {
  const entry = normalizeLogEntry(raw);
  const user = (raw as { user?: unknown } | null)?.user;
  if (entry && typeof user === "string") entry.user = user;
  return entry;
}

function requireToken(flags: Record<string, string>, exitCode: number) {
  if (flags.from || config.apiToken) return;
  process.stderr.write(MISSING_TOKEN);
  process.exit(exitCode);
}

export async function listErrors(args: string[]) {
  const { flags } = parseFlags(args);
  requireToken(flags, 2);
  const groups = groupErrors(await errorEntries(flags, "1d")).toSorted(
    (a, b) => b.count - a.count
  );
  for (const group of groups) {
    process.stdout.write(`${JSON.stringify(group)}\n`);
  }
  if (groups.length === 0) process.stderr.write("No errors.\n");
}

export async function watchErrors(args: string[]) {
  const { flags } = parseFlags(args);
  // A fork without the secrets has nothing to watch; that is not a failure.
  if (!githubReady) {
    process.stderr.write("ops: no GITHUB_TOKEN/GITHUB_REPOSITORY; skipped.\n");
    return;
  }
  requireToken(flags, 0);
  // Wider than the schedule, so a late or skipped run loses nothing; each
  // issue remembers the last occurrence it counted.
  const entries = await errorEntries(flags, "2h");
  const summary = await syncIssues(entries);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
