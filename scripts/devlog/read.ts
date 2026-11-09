import {
  LOG_LEVELS,
  LOG_MARKER,
  type LogEntry,
  type LogLevel
} from "@cot/shared";

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

const KEY_ORDER: (keyof LogEntry)[] = [
  "ts",
  "level",
  "source",
  "scope",
  "msg",
  "user",
  "session",
  "requestId",
  "chatId",
  "version",
  "data"
];

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
  // Workers Logs reorders the fields; print every line in one order.
  const entry: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    if (record[key] !== undefined) entry[key] = record[key];
  }
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

export type LogQuery = {
  since?: string;
  sources?: string[];
  level?: LogLevel;
  grep?: string;
  limit?: number;
};

/** Cot's lines from Workers Logs, oldest first. Needs `config.apiToken`. */
export async function queryLogs(query: LogQuery): Promise<LogEntry[]> {
  const minLevel = LOG_LEVELS.indexOf(query.level ?? "debug");
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
      timeframe: { from: parseSince(query.since), to: Date.now() },
      parameters: {
        filters: [
          {
            key: "$metadata.service",
            operation: "eq",
            type: "string",
            value: config.worker
          },
          // Only Cot's own lines (log/logger.ts adds the marker).
          { key: LOG_MARKER, operation: "eq", type: "number", value: 1 },
          // Errors are filtered by the API too, so a busy hour of debug
          // lines can't push them past its 2000-event limit.
          ...(query.level === "error"
            ? [
                {
                  key: "level",
                  operation: "eq",
                  type: "string",
                  value: "error"
                }
              ]
            : [])
        ],
        ...(query.grep ? { needle: { value: query.grep } } : {})
      }
    })
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`Workers Logs query failed: ${JSON.stringify(body)}`);
  }
  return eventsOf(body)
    .map(entryOf)
    .filter((entry): entry is LogEntry => entry !== null)
    .filter((entry) => !query.sources || query.sources.includes(entry.source))
    .filter((entry) => LOG_LEVELS.indexOf(entry.level) >= minLevel)
    .toSorted((a, b) => a.ts.localeCompare(b.ts))
    .slice(-(query.limit ?? 200));
}

export const MISSING_TOKEN =
  "Set CLOUDFLARE_API_TOKEN to a Cloudflare API token with Workers Observability access (see .agents/skills/dev-logs/SKILL.md).\n";

export async function readLogs(args: string[]) {
  const { flags } = parseFlags(args);
  if (!config.apiToken) {
    process.stderr.write(MISSING_TOKEN);
    process.exit(2);
  }
  let entries: LogEntry[];
  try {
    entries = await queryLogs({
      since: flags.since,
      sources: flags.source?.split(",").filter(Boolean),
      level: LOG_LEVELS.find((level) => level === flags.level),
      grep: flags.grep,
      limit: Number(flags.limit ?? 200)
    });
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  }
  for (const entry of entries)
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  if (entries.length === 0) process.stderr.write("No matching log lines.\n");
}
