import {
  type DevLogStatus,
  type LogSource,
  MAX_LOG_BATCH,
  normalizeLogEntry
} from "@cot/shared";

import { getUserFromRequest } from "../auth/session";
import { jsonResponse } from "../http/responses";
import { devLogsEnabled, emit } from "./logger";

/**
 * The developer-mode routes (DEV_LOG_ROUTES). Clients ask whether to send
 * logs, then post batches with their session; builds and CI post failures
 * with the DEV_LOGS_TOKEN secret. Each entry is checked, then printed as a
 * server line would be, so Workers Logs holds every source in one format.
 */

const MAX_BODY = 256 * 1024;
const CLIENT_SOURCES: LogSource[] = ["web", "ios"];
const BUILD_SOURCES: LogSource[] = ["build", "ci"];

export function handleDevStatus() {
  const status: DevLogStatus = { enabled: devLogsEnabled() };
  return jsonResponse(status);
}

/** Who may post, and which sources they may claim, or null. */
async function sender(request: Request, env: Env) {
  const token = (env as Env & { DEV_LOGS_TOKEN?: string }).DEV_LOGS_TOKEN;
  const bearer = request.headers.get("Authorization")?.match(/^Bearer (.+)$/);
  if (token && bearer?.[1] && (await sameSecret(bearer[1], token))) {
    return { sources: BUILD_SOURCES, user: undefined };
  }
  if (!devLogsEnabled()) return null;
  const user = await getUserFromRequest(request, env);
  return user ? { sources: CLIENT_SOURCES, user: user.email } : null;
}

export async function handleDevIngest(request: Request, env: Env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const from = await sender(request, env);
  if (!from) return new Response("Unauthorized", { status: 401 });

  const body = await request.text();
  if (body.length > MAX_BODY) {
    return new Response("Too large", { status: 413 });
  }
  let entries: unknown;
  try {
    // Untrusted JSON; every entry goes through normalizeLogEntry below.
    entries = (JSON.parse(body) as { entries?: unknown }).entries;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!Array.isArray(entries) || entries.length > MAX_LOG_BATCH) {
    return new Response("Expected { entries: LogEntry[] }", { status: 400 });
  }

  let accepted = 0;
  for (const raw of entries) {
    const entry = normalizeLogEntry(raw);
    if (!entry || !from.sources.includes(entry.source)) continue;
    emit(from.user ? { ...entry, user: from.user } : entry);
    accepted += 1;
  }
  return jsonResponse({ accepted });
}

/** Compares secrets in constant time (hashing first evens the lengths). */
async function sameSecret(a: string, b: string) {
  const encoder = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b))
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}
