import type { LogEntry, LogSource } from "./logs";

/**
 * Groups error lines into "the same problem", so production errors become
 * one tracked issue each instead of a stream (scripts/ops, the release-loop
 * skill). Pure logic: the watcher feeds it `bun run logs` output.
 */

export type ErrorGroup = {
  /** Stable across deploys, users and ids: see `logFingerprint`. */
  fingerprint: string;
  source: LogSource;
  scope: string;
  /** The message with ids and numbers replaced, as a title. */
  title: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  /** Deployed shas or client builds it was seen on. */
  versions: string[];
  /** How many accounts hit it; their emails are never kept. */
  users: number;
  /** The newest occurrence, safe to publish (see `publicSample`). */
  sample: LogEntry;
};

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** Long tokens that contain a digit: ids, hashes, keys. */
const TOKEN = /\b(?=[\w-]*\d)[\w-]{16,}\b/g;

/** A message without the parts that differ between occurrences. */
function normalizeMessage(text: string) {
  return text
    .replace(EMAIL, "<email>")
    .replace(UUID, "<id>")
    .replace(TOKEN, "<id>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}

function errorOf(entry: LogEntry) {
  const error = entry.data?.error;
  // Trust boundary: `data` is free-form; errors are {name, message, stack}.
  const record = (
    typeof error === "object" && error !== null ? error : {}
  ) as Record<string, unknown>;
  const pick = (key: string) =>
    typeof record[key] === "string" ? record[key] : "";
  return { name: pick("name"), message: pick("message"), stack: pick("stack") };
}

/** FNV-1a, 32 bits, as 8 hex digits. Not cryptographic; it names a group. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The same for every occurrence of one problem: source, scope, and the
 * normalized message and error. The stack is left out on purpose, because
 * bundling changes its names and lines with every deploy.
 */
export function logFingerprint(entry: LogEntry) {
  const error = errorOf(entry);
  return hash(
    [
      entry.source,
      entry.scope,
      normalizeMessage(entry.msg),
      error.name,
      normalizeMessage(error.message)
    ].join("|")
  );
}

/** Masks what must not leave the logs: emails here, secrets via `redact`. */
function scrubLogText(text: string) {
  return text.replace(EMAIL, "<email>");
}

/**
 * An entry that can go in a public issue: no `user`, no free-form `data`
 * beyond the error itself, emails masked. `requestId` and `session` stay so
 * `bun run logs --grep` finds the full story.
 */
export function publicSample(entry: LogEntry): LogEntry {
  const error = errorOf(entry);
  const sample: LogEntry = {
    ts: entry.ts,
    level: entry.level,
    source: entry.source,
    scope: entry.scope,
    msg: scrubLogText(entry.msg)
  };
  for (const key of ["session", "requestId", "version"] as const) {
    if (entry[key]) sample[key] = entry[key];
  }
  if (error.name || error.message) {
    sample.data = {
      error: {
        name: error.name,
        message: scrubLogText(error.message),
        stack: scrubLogText(error.stack)
      }
    };
  }
  return sample;
}

/**
 * Error-level entries grouped by fingerprint, in order of first appearance
 * in `entries`, which may be in any order.
 */
export function groupErrors(entries: LogEntry[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup & { seen: Set<string> }>();
  for (const entry of entries) {
    if (entry.level !== "error") continue;
    const fingerprint = logFingerprint(entry);
    let group = groups.get(fingerprint);
    if (!group) {
      group = {
        fingerprint,
        source: entry.source,
        scope: entry.scope,
        title: normalizeMessage(entry.msg),
        count: 0,
        firstSeen: entry.ts,
        lastSeen: entry.ts,
        versions: [],
        users: 0,
        sample: publicSample(entry),
        seen: new Set()
      };
      groups.set(fingerprint, group);
    }
    group.count += 1;
    if (entry.ts < group.firstSeen) group.firstSeen = entry.ts;
    if (entry.ts >= group.lastSeen) {
      group.lastSeen = entry.ts;
      group.sample = publicSample(entry);
    }
    if (entry.version && !group.versions.includes(entry.version)) {
      group.versions.push(entry.version);
    }
    if (entry.user) group.seen.add(entry.user);
    group.users = group.seen.size;
  }
  return [...groups.values()].map(({ seen: _seen, ...group }) => group);
}
