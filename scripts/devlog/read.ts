import { LOG_LEVELS, LOG_MARKER, type LogEntry } from "@cot/shared";

import { config, parseFlags, parseSince } from "./config";

/**
 * `bun run logs`: Cot's lines from Workers Logs, oldest first, one JSON
 * `LogEntry` per line on stdout, so any agent or `jq` can read them.
 *
 *   --since 1h       15m, 2h, 1d or an ISO date (default 1h)
 *   --source ios     server, web, ios, build or ci (comma-separated)
 *   --level warn     this level and above
 *   --grep text      full-text match, e.g. a requestId or session
 *   --limit 200      most lines to print
 */

type Event = { source?: unknown; $metadata?: { message?: string } };

const QUERY_URL = (account: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`;

/** The `LogEntry` in one Workers Logs event, or null for other lines. */
function entryOf(event: Event): LogEntry | null {
  let value = event.source;
  if (typeof value !== "object" || value === null) {
    try {
      value = JSON.parse(event.$metadata?.message ?? "");
    } catch {
      return null;
    }
  }
  // Trust boundary: lines the Worker wrote with log/logger.ts.
  const record = value as Record<string, unknown>;
  if (record[LOG_MARKER] !== 1) return null;
  const { [LOG_MARKER]: _marker, ...entry } = record;
  return entry as LogEntry;
}

/** The events array, wherever this API version puts it. */
function eventsOf(body: unknown): Event[] {
  const result = (body as { result?: { events?: unknown } }).result;
  const events = result?.events;
  if (Array.isArray(events)) return events as Event[];
  const nested = (events as { events?: unknown } | undefined)?.events;
  return Array.isArray(nested) ? (nested as Event[]) : [];
}

export async function readLogs(args: string[]) {
  const { flags } = parseFlags(args);
  if (!config.apiToken) {
    process.stderr.write(
      "Set CLOUDFLARE_API_TOKEN to a Cloudflare API token with Workers Observability access (see .agents/skills/dev-logs/SKILL.md).\n"
    );
    process.exit(2);
  }
  const from = parseSince(flags.since);
  const sources = flags.source?.split(",").filter(Boolean);
  const minLevel = LOG_LEVELS.indexOf(
    (flags.level ?? "debug") as (typeof LOG_LEVELS)[number]
  );
  const limit = Number(flags.limit ?? 200);

  const response = await fetch(QUERY_URL(config.accountId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      queryId: "cot-dev-logs",
      view: "events",
      limit: 2000,
      timeframe: { from, to: Date.now() },
      parameters: {
        filters: [
          {
            key: "$metadata.service",
            operation: "eq",
            type: "string",
            value: config.worker
          },
          // Only Cot's own lines (log/logger.ts adds the marker).
          { key: LOG_MARKER, operation: "eq", type: "number", value: 1 }
        ],
        ...(flags.grep ? { needle: { value: flags.grep } } : {})
      }
    })
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    process.stderr.write(
      `Workers Logs query failed: ${JSON.stringify(body)}\n`
    );
    process.exit(1);
  }

  const entries = eventsOf(body)
    .map(entryOf)
    .filter((entry): entry is LogEntry => entry !== null)
    .filter((entry) => !sources || sources.includes(entry.source))
    .filter((entry) => LOG_LEVELS.indexOf(entry.level) >= minLevel)
    .toSorted((a, b) => a.ts.localeCompare(b.ts))
    .slice(-limit);
  for (const entry of entries)
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  if (entries.length === 0) process.stderr.write("No matching log lines.\n");
}
