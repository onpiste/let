/**
 * The one log format every part of Cot writes: the Worker, the web and iOS
 * clients, local builds and CI. The Worker prints each entry as a single
 * JSON line, so they all land in Workers Logs and `bun run logs` reads them
 * back (see .agents/skills/dev-logs/SKILL.md).
 */

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_SOURCES = ["server", "web", "ios", "build", "ci"] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

export type LogEntry = {
  /** ISO-8601 UTC, set by whoever wrote the line. */
  ts: string;
  level: LogLevel;
  source: LogSource;
  /** The area it came from: "apns", "socket", "auth", "tsc", … */
  scope: string;
  msg: string;
  /** The account's email. The server sets it; clients never send it. */
  user?: string;
  /** One app launch, page load or CI run, to follow a client over time. */
  session?: string;
  /** Joins a client's lines with the server's for the same request. */
  requestId?: string;
  chatId?: string;
  /** Client build, the git sha of a build, or the Worker's deployed sha. */
  version?: string;
  /** Errors: {name, message, stack}. Builds: {command, exitCode, file, line, …}. */
  data?: Record<string, unknown>;
};

/** Marks Cot's own lines in Workers Logs, so queries can skip the rest. */
export const LOG_MARKER = "cot";

export const DEV_LOG_ROUTES = {
  /** GET: `DevLogStatus`, so clients know whether to send logs. */
  status: "/dev/status",
  /** POST `DevLogBatch`: a client's session, or the DEV_LOGS_TOKEN (builds). */
  ingest: "/dev/logs",
  /** GET: `DevHealth`, public. The post-deploy smoke test reads it. */
  health: "/dev/health"
} as const;

export type DevLogStatus = { enabled: boolean };
/** `version` is the deployed git sha ("" for a deploy that set no tag). */
export type DevHealth = { ok: boolean; version: string };
export type DevLogBatch = { entries: LogEntry[] };

/** Most entries one ingest request may carry. */
export const MAX_LOG_BATCH = 100;

const MAX_TEXT = 2000;
const MAX_DATA = 8000;
const SECRET_KEY =
  /token|secret|password|passwd|authorization|cookie|api[-_]?key|^key$/i;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A copy of `data` with secret-looking values masked, at any depth. */
export function redact(data: unknown, depth = 0): unknown {
  if (depth > 6) return "[deep]";
  if (Array.isArray(data)) return data.map((item) => redact(item, depth + 1));
  if (!isRecord(data)) return data;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : redact(value, depth + 1);
  }
  return out;
}

/**
 * An entry from an untrusted sender, checked and trimmed, or null when it
 * isn't one. Unknown fields are dropped and `data` is redacted and capped.
 */
export function normalizeLogEntry(raw: unknown): LogEntry | null {
  if (!isRecord(raw)) return null;
  const level = LOG_LEVELS.find((l) => l === raw.level);
  const source = LOG_SOURCES.find((s) => s === raw.source);
  const msg = text(raw.msg, MAX_TEXT);
  if (!level || !source || !msg) return null;

  const ts = text(raw.ts, 40);
  const entry: LogEntry = {
    ts: ts && !Number.isNaN(Date.parse(ts)) ? ts : new Date().toISOString(),
    level,
    source,
    scope: text(raw.scope, 60) || "app",
    msg
  };
  for (const key of ["session", "requestId", "chatId", "version"] as const) {
    const value = text(raw[key], 120);
    if (value) entry[key] = value;
  }
  if (isRecord(raw.data)) {
    const json = JSON.stringify(redact(raw.data));
    entry.data =
      json.length <= MAX_DATA
        ? (JSON.parse(json) as Record<string, unknown>)
        : { truncated: json.slice(0, MAX_DATA) };
  }
  return entry;
}

/** An error as `data`, for every platform's `log.error(scope, msg, …)`. */
export function errorData(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, MAX_TEXT)
    };
  }
  return { message: String(error) };
}
