import {
  DEV_LOG_ROUTES,
  type DevLogStatus,
  errorData,
  type LogEntry,
  type LogLevel,
  MAX_LOG_BATCH
} from "@cot/shared";

/**
 * Developer-mode logs from the browser (mirrors DevLog.swift on iOS). When
 * the deployment has DEV_LOGS on, lines are batched to the Worker, which
 * writes them to Workers Logs next to its own; otherwise every call is a
 * no-op. See .agents/skills/dev-logs/SKILL.md.
 */

type Data = Record<string, unknown>;

const session = crypto.randomUUID();
const FLUSH_MS = 5000;
const MAX_QUEUE = 500;

/** null until /dev/status answers; lines wait in the queue until then. */
let enabled: boolean | null = null;
let queue: LogEntry[] = [];

function add(level: LogLevel, scope: string, msg: string, data?: Data) {
  if (enabled === false) return;
  queue.push({
    ts: new Date().toISOString(),
    level,
    source: "web",
    scope,
    msg,
    session,
    ...(data ? { data } : {})
  });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (enabled && queue.length >= MAX_LOG_BATCH) flush();
}

function flush(onUnload = false) {
  if (!enabled || queue.length === 0) return;
  const entries = queue.slice(0, MAX_LOG_BATCH);
  queue = queue.slice(MAX_LOG_BATCH);
  const body = JSON.stringify({ entries });
  if (onUnload) {
    navigator.sendBeacon(
      DEV_LOG_ROUTES.ingest,
      new Blob([body], { type: "application/json" })
    );
    return;
  }
  // Signed out (401) or offline: these lines are lost, which is fine for logs.
  void fetch(DEV_LOG_ROUTES.ingest, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  }).catch(() => {});
}

export const devLog = {
  debug: (scope: string, msg: string, data?: Data) =>
    add("debug", scope, msg, data),
  info: (scope: string, msg: string, data?: Data) =>
    add("info", scope, msg, data),
  warn: (scope: string, msg: string, data?: Data) =>
    add("warn", scope, msg, data),
  /** `error` is anything thrown; it becomes `data.error`. */
  error: (scope: string, msg: string, error?: unknown, data?: Data) =>
    add("error", scope, msg, {
      ...data,
      ...(error === undefined ? {} : { error: errorData(error) })
    })
};

/**
 * `fetch` with an X-Request-Id, so this request's client and server lines
 * share one id, and a log line when it fails.
 */
export async function tracedFetch(path: string, init: RequestInit = {}) {
  const requestId = crypto.randomUUID();
  const headers = new Headers(init.headers);
  headers.set("X-Request-Id", requestId);
  try {
    const res = await fetch(path, { ...init, headers });
    if (!res.ok && res.status !== 401) {
      devLog.warn("http", `${init.method ?? "GET"} ${path} ${res.status}`, {
        requestId
      });
    }
    return res;
  } catch (error) {
    devLog.error("http", `${init.method ?? "GET"} ${path} failed`, error, {
      requestId
    });
    throw error;
  }
}

/** Asks the Worker whether to send logs, and catches uncaught errors. */
export function startDevLog() {
  window.addEventListener("error", (event) =>
    devLog.error("window", event.message, event.error, {
      file: event.filename,
      line: event.lineno
    })
  );
  window.addEventListener("unhandledrejection", (event) =>
    devLog.error("window", "Unhandled rejection", event.reason)
  );
  window.addEventListener("pagehide", () => flush(true));

  fetch(DEV_LOG_ROUTES.status)
    // Trust boundary: the Worker's JSON response.
    .then(async (res) => (res.ok ? ((await res.json()) as DevLogStatus) : null))
    .catch(() => null)
    .then((status) => {
      enabled = status?.enabled === true;
      if (!enabled) {
        queue = [];
        return;
      }
      devLog.info("app", "Page loaded", {
        path: location.pathname,
        userAgent: navigator.userAgent
      });
      setInterval(() => flush(), FLUSH_MS);
    })
    .catch(() => {});
}
