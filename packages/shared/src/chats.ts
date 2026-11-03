/**
 * One conversation in the history list. Each conversation is its own agent
 * (the `Chat` facet under the user's assistant), so several can answer at
 * once and a reply keeps going while the client looks at another chat.
 */
export type ChatSummary = {
  id: string;
  /** A short title the model wrote, or the first thing the user said. */
  title: string;
  /** ISO timestamp of the last change. */
  updatedAt: string;
  /** The chat last written in from any client; Telegram talks into it. */
  active: boolean;
  /** The assistant is answering in this chat right now. */
  running: boolean;
  /** From `searchChats`: the text around the first match. */
  snippet?: string;
};

/**
 * One page of the history list (`listChats`). Pass `next` back to get the
 * page after it; null means this was the last one.
 */
export type ChatPage = { chats: ChatSummary[]; next: string | null };

/** How many chats `listChats` returns at a time. */
export const CHAT_PAGE_SIZE = 30;

/** Where a page ends: the last chat's date and id, newest-first order. */
type ChatCursor = { updatedAt: string; id: string };

/** The `next` cursor for a page that ends with `chat`. */
export function chatCursor(chat: Pick<ChatSummary, "updatedAt" | "id">) {
  return `${chat.updatedAt}|${chat.id}`;
}

/**
 * Reads a cursor from `chatCursor`; null or undefined means the first page.
 * The argument arrives untyped from the client, so anything else throws.
 */
export function parseChatCursor(cursor: unknown): ChatCursor | null {
  if (cursor === null || cursor === undefined) return null;
  if (typeof cursor !== "string" || cursor.length > 200) {
    throw new Error("Bad history cursor.");
  }
  const at = cursor.indexOf("|");
  const updatedAt = cursor.slice(0, at);
  const id = cursor.slice(at + 1);
  if (at < 0 || !updatedAt || !id || Number.isNaN(Date.parse(updatedAt))) {
    throw new Error("Bad history cursor.");
  }
  return { updatedAt, id };
}

/**
 * Adds a page to the chats already shown. A chat written in while the user
 * scrolled moves to the top and can come back on a later page; keep the
 * copy already shown.
 */
export function appendChats(shown: ChatSummary[], page: ChatSummary[]) {
  const seen = new Set(shown.map((chat) => chat.id));
  return [...shown, ...page.filter((chat) => !seen.has(chat.id))];
}

/** Longest title `renameChat` accepts. */
export const CHAT_TITLE_LENGTH = 80;

/**
 * A title from `renameChat`, trimmed and on one line. The argument arrives
 * untyped from the client, so anything unusable throws.
 */
export function checkChatTitle(title: unknown) {
  const clean =
    typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  if (!clean || clean.length > CHAT_TITLE_LENGTH) {
    throw new Error(`A title needs 1 to ${CHAT_TITLE_LENGTH} characters.`);
  }
  return clean;
}

/** A text file pasted into a message as text; the UI shows it as a chip. */
export const INLINE_FILE = /<file name="([^"]*)">\n[\s\S]*?\n<\/file>\n?/g;

type MessagePart = { type: string; text?: string };

/**
 * A user message's parts with its typed text replaced by `text`, for
 * `editMessage`: attachments, including text files pasted inline, stay.
 */
export function editedParts<P extends MessagePart>(parts: P[], text: string) {
  const kept: (P | { type: "text"; text: string })[] = parts.flatMap((part) => {
    if (part.type !== "text" || typeof part.text !== "string") return [part];
    const files = [...part.text.matchAll(INLINE_FILE)].map((m) => m[0]);
    return files.length ? [{ ...part, text: files.join("") }] : [];
  });
  const typed = text.trim();
  if (typed) kept.push({ type: "text", text: typed });
  return kept;
}

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
