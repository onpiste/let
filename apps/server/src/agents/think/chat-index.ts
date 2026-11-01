import type { Agent } from "agents";
import type { UIMessage } from "ai";

type Host = Pick<Agent<Env>, "sql">;

/** A file pasted into a message as text; history and search keep its name. */
export const INLINE_FILE = /<file name="([^"]*)">\n[\s\S]*?\n<\/file>\n?/g;

/** Bump to rebuild the index from the saved chats (e.g. after a format change). */
const INDEX_VERSION = "1";
/** The trigram tokenizer matches substrings of at least this many characters. */
const MIN_TERM = 3;
const MAX_TERMS = 8;
const MAX_HITS = 8;
const HITS_PER_CHAT = 2;
const SNIPPET_CHARS = 200;
const READ_RADIUS = 4;
const READ_CHARS = 6000;

export type ChatHit = {
  chatId: string;
  title: string;
  updatedAt: string;
  seq: number;
  role: string;
  snippet: string;
};

type Row = {
  chat_id: string;
  seq: number;
  role: string;
  text: string;
  title: string;
  updated_at: string;
};

/** The words a message is found by: its text, with pasted files as names. */
function messageText(message: UIMessage) {
  const lines: string[] = [];
  for (const part of message.parts) {
    if (part.type === "text")
      lines.push(
        part.text.replace(INLINE_FILE, (_, name: string) => `[file: ${name}]`)
      );
    if (part.type === "file") lines.push(`[file: ${part.filename ?? "file"}]`);
  }
  return lines.join("\n").trim();
}

/** About SNIPPET_CHARS of `text` around the first term it contains. */
function snippet(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  const found = terms
    .map((term) => lower.indexOf(term.toLowerCase()))
    .filter((at) => at >= 0);
  const at = found.length ? Math.min(...found) : 0;
  const start = Math.max(0, at - SNIPPET_CHARS / 2);
  const end = Math.min(text.length, start + SNIPPET_CHARS);
  const body = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${body}${end < text.length ? "…" : ""}`;
}

/** `%term%` for LIKE, with its wildcards taken literally (ESCAPE '\'). */
function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Full-text index over the saved chats, so the model can look up what was
 * said in earlier conversations. It mirrors `chat_messages` (see history.ts)
 * and is rewritten whenever a chat is archived or deleted. The trigram
 * tokenizer finds substrings, which also works for languages written without
 * spaces (Chinese, Japanese).
 */
export class ChatIndex {
  constructor(private readonly host: Host) {}

  /** Needs history's tables; builds the index once for chats saved before it. */
  ensure() {
    this.host.sql`CREATE VIRTUAL TABLE IF NOT EXISTS chat_search USING fts5(
      chat_id UNINDEXED,
      seq UNINDEXED,
      role UNINDEXED,
      text,
      tokenize = 'trigram'
    )`;
    const [row] = this.host.sql<{ value: string }>`
      SELECT value FROM chat_state WHERE key = 'search_index'`;
    if (row?.value === INDEX_VERSION) return;
    this.host.sql`DELETE FROM chat_search`;
    const chats = this.host.sql<{ id: string }>`SELECT id FROM chats`;
    for (const { id } of chats) {
      const rows = this.host.sql<{ json: string }>`
        SELECT json FROM chat_messages WHERE chat_id = ${id} ORDER BY seq`;
      // Parsed from our own snapshot of Think's messages.
      this.put(
        id,
        rows.map((r) => JSON.parse(r.json) as UIMessage)
      );
    }
    this.host.sql`INSERT OR REPLACE INTO chat_state (key, value)
      VALUES ('search_index', ${INDEX_VERSION})`;
  }

  /** Replaces a chat's entries with `messages`. */
  put(chatId: string, messages: UIMessage[]) {
    this.drop(chatId);
    messages.forEach((message, seq) => {
      const text = messageText(message);
      if (!text) return;
      this.host.sql`INSERT INTO chat_search (chat_id, seq, role, text)
        VALUES (${chatId}, ${seq}, ${message.role}, ${text})`;
    });
  }

  drop(chatId: string) {
    this.host.sql`DELETE FROM chat_search WHERE chat_id = ${chatId}`;
  }

  /** The best matches for `query` outside the chat `exceptId`. */
  search(query: string, exceptId: string): ChatHit[] {
    const terms = [
      ...new Set(query.replace(/"/g, " ").split(/\s+/).filter(Boolean))
    ].slice(0, MAX_TERMS);
    if (terms.length === 0) return [];
    const long = terms.filter(
      // oxlint-disable-next-line no-misused-spread -- trigrams count code points
      (term) => [...term].length >= MIN_TERM
    );
    const rows = long.length ? this.matchAny(long) : this.likeAll(terms);
    const perChat = new Map<string, number>();
    const hits: ChatHit[] = [];
    for (const row of rows) {
      const count = perChat.get(row.chat_id) ?? 0;
      if (row.chat_id === exceptId || count >= HITS_PER_CHAT) continue;
      perChat.set(row.chat_id, count + 1);
      hits.push({
        chatId: row.chat_id,
        title: row.title,
        updatedAt: row.updated_at,
        seq: row.seq,
        role: row.role,
        snippet: snippet(row.text, terms)
      });
      if (hits.length === MAX_HITS) break;
    }
    return hits;
  }

  /** Ranked rows containing any of the terms (each at least MIN_TERM long). */
  private matchAny(terms: string[]) {
    const match = terms.map((term) => `"${term}"`).join(" OR ");
    return this.host.sql<Row>`
      SELECT s.chat_id, s.seq, s.role, s.text, c.title, c.updated_at
      FROM (SELECT chat_id, seq, role, text, rank FROM chat_search
            WHERE chat_search MATCH ${match} ORDER BY rank LIMIT 50) s
      JOIN chats c ON c.id = s.chat_id
      ORDER BY s.rank`;
  }

  /** Newest rows containing every term: short terms the trigrams can't match. */
  private likeAll(terms: string[]) {
    const [first = "", ...rest] = terms;
    const rows = this.host.sql<Row>`
      SELECT s.chat_id, s.seq, s.role, s.text, c.title, c.updated_at
      FROM chat_search s JOIN chats c ON c.id = s.chat_id
      WHERE s.text LIKE ${likePattern(first)} ESCAPE '\\'
      ORDER BY c.updated_at DESC, s.seq LIMIT 200`;
    return rows.filter((row) => {
      const lower = row.text.toLowerCase();
      return rest.every((term) => lower.includes(term.toLowerCase()));
    });
  }

  /** The messages around `seq` in a saved chat, as plain text. */
  read(chatId: string, seq: number) {
    const [chat] = this.host.sql<{ title: string; updated_at: string }>`
      SELECT title, updated_at FROM chats WHERE id = ${chatId}`;
    if (!chat) return "That chat no longer exists.";
    const rows = this.host.sql<{ seq: number; role: string; text: string }>`
      SELECT seq, role, text FROM chat_search
      WHERE chat_id = ${chatId}
        AND seq BETWEEN ${seq - READ_RADIUS} AND ${seq + READ_RADIUS}
      ORDER BY seq`;
    const body = rows
      .map((r) => `[${r.seq}] ${r.role}: ${r.text}`)
      .join("\n\n");
    return `${chat.title} (${chat.updated_at})\n\n${body}`.slice(0, READ_CHARS);
  }
}
