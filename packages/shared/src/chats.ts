/**
 * One conversation in the history list. The assistant keeps exactly one
 * conversation active (the one Telegram and every client share); the others
 * are saved snapshots that `openChat` swaps back in.
 */
export type ChatSummary = {
  id: string;
  /** The first thing the user said, trimmed. */
  title: string;
  /** ISO timestamp of the last change. */
  updatedAt: string;
  active: boolean;
  /** From `searchChats`: the text around the first match. */
  snippet?: string;
};

/** Longest query `searchChats` accepts. */
export const CHAT_QUERY_LENGTH = 100;

const SNIPPET_BEFORE = 30;
const SNIPPET_LENGTH = 120;

/**
 * The text around the first case-insensitive match of `query`, on one line
 * and with ellipses where it was cut, or null when the text has no match.
 */
export function searchSnippet(text: string, query: string): string | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(needle);
  if (at < 0) return null;
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = Math.min(flat.length, start + SNIPPET_LENGTH);
  const body = flat.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${body}${end < flat.length ? "…" : ""}`;
}
