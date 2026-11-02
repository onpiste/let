import { env } from "cloudflare:workers";

import {
  errorData,
  LOG_MARKER,
  type LogEntry,
  type LogLevel,
  redact
} from "@cot/shared";

/**
 * The Worker's logger. Every line is one `LogEntry` as JSON, which Workers
 * Logs indexes field by field, so the server's lines and the ones clients
 * and builds send through /dev/logs read back the same way (`bun run logs`).
 * Debug and info lines only appear in developer mode (DEV_LOGS); warnings
 * and errors always do.
 */

type Context = Pick<LogEntry, "user" | "requestId" | "chatId">;
type Data = Record<string, unknown>;

export function devLogsEnabled() {
  // Widened: `wrangler types` makes a var a literal type, and a fork that
  // sets "" would otherwise fail to typecheck this comparison.
  const mode: string = env.DEV_LOGS;
  return mode === "on";
}

/** Prints an entry as it is, for ones already checked (see routes.ts). */
export function emit(entry: LogEntry) {
  const line = JSON.stringify({ [LOG_MARKER]: 1, ...entry });
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  // oxlint-disable-next-line no-console -- the one sanctioned info log
  else console.log(line);
}

function write(
  level: LogLevel,
  context: Context,
  scope: string,
  msg: string,
  data?: Data
) {
  if ((level === "debug" || level === "info") && !devLogsEnabled()) return;
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    source: "server",
    scope,
    msg,
    ...context
  };
  if (data) entry.data = redact(data) as Data;
  emit(entry);
}

function logger(context: Context) {
  return {
    debug: (scope: string, msg: string, data?: Data) =>
      write("debug", context, scope, msg, data),
    info: (scope: string, msg: string, data?: Data) =>
      write("info", context, scope, msg, data),
    warn: (scope: string, msg: string, data?: Data) =>
      write("warn", context, scope, msg, data),
    /** `error` is anything thrown; it becomes `data.error`. */
    error: (scope: string, msg: string, error?: unknown, data?: Data) =>
      write("error", context, scope, msg, {
        ...data,
        ...(error === undefined ? {} : { error: errorData(error) })
      }),
    /** A logger that adds `user`, `requestId` or `chatId` to every line. */
    with: (more: Context) => logger({ ...context, ...more })
  };
}

export const log = logger({});
