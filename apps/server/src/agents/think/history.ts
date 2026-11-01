import type { Agent } from "agents";
import type { UIMessage } from "ai";

import type { ChatSummary } from "@cot/shared";

import { ChatIndex, INLINE_FILE } from "./chat-index";
import { chatMatch, checkQuery } from "./chat-search";
import { generateTitle } from "./title";

type Host = Pick<Agent<Env>, "sql">;

const TITLE_LENGTH = 60;
const SEARCH_RESULTS = 50;
/**
 * A chat still marked as answering after this long lost its turn without
 * reporting back (e.g. deleted mid-turn); stop showing it as running.
 */
const RUNNING_TIMEOUT_MS = 15 * 60 * 1000;

/** The first user text (or attached file name), for the history list. */
function chatTitle(messages: UIMessage[]) {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const files: string[] = [];
    let text = "";
    for (const part of message.parts) {
      if (part.type === "file") files.push(part.filename ?? "file");
      if (part.type !== "text") continue;
      text += part.text.replace(INLINE_FILE, (_, name: string) => {
        files.push(name);
        return "";
      });
    }
    const title = (text.trim() || files.join(", ")).replace(/\s+/g, " ");
    if (title) return title.slice(0, TITLE_LENGTH);
  }
  return "New chat";
}

/** Callable arguments arrive untyped from the client. */
export function checkChatId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !id || id.length > 64) {
    throw new Error("Bad chat id.");
  }
}

/**
 * Stamps each assistant reply with `createdAt` (epoch ms) when its stream
 * starts, so clients can show the time after a long pause. A resumed turn
 * keeps the stamp it already has (Think does not overwrite existing keys).
 */
export function stampCreatedAt({ part }: { part: { type: string } }) {
  return part.type === "start" ? { createdAt: Date.now() } : undefined;
}

/**
 * The catalog of the user's chats, kept by the assistant. Each conversation
 * lives in its own `Chat` agent (chat.ts); after every turn it reports its
 * messages here, which updates the title, the history list and the search
 * index (chat-index.ts) the model and the history drawer use.
 */
export class ChatHistory {
  constructor(private readonly host: Host) {}

  private get index() {
    return new ChatIndex(this.host);
  }

  ensureTables() {
    this.host.sql`CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
    // Snapshots from when one conversation was swapped in and out; read once
    // by chat-migration.ts and emptied.
    this.host.sql`CREATE TABLE IF NOT EXISTS chat_messages (
      chat_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      json TEXT NOT NULL,
      PRIMARY KEY (chat_id, seq)
    )`;
    this.host.sql`CREATE TABLE IF NOT EXISTS chat_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`;
    const columns = this.host.sql<{ name: string }>`
      SELECT name FROM pragma_table_info('chats')`;
    if (!columns.some((column) => column.name === "running_since")) {
      this.host.sql`ALTER TABLE chats ADD COLUMN running_since INTEGER`;
    }
    this.index.ensure();
  }

  /** The chat last written in, which Telegram talks into. */
  activeId() {
    const [row] = this.host.sql<{ value: string }>`
      SELECT value FROM chat_state WHERE key = 'active'`;
    if (row) return row.value;
    return this.setActive(crypto.randomUUID());
  }

  setActive(id: string) {
    this.host.sql`INSERT OR REPLACE INTO chat_state (key, value)
      VALUES ('active', ${id})`;
    return id;
  }

  /** Ids of the chats that have messages. */
  ids() {
    return new Set(
      this.host.sql<{ id: string }>`SELECT id FROM chats`.map((r) => r.id)
    );
  }

  /** A title the model wrote, which wins over the first-message fallback. */
  private namedTitle(id: string) {
    const [row] = this.host.sql<{ value: string }>`
      SELECT value FROM chat_state WHERE key = ${`title:${id}`}`;
    return row?.value ?? null;
  }

  /**
   * Saves what a chat now holds. `running` is true while a turn is in
   * flight, false when one ended and null to leave it as it is.
   */
  record(id: string, messages: UIMessage[], running: boolean | null) {
    if (messages.length === 0) return;
    const title = this.namedTitle(id) ?? chatTitle(messages);
    const now = new Date().toISOString();
    this.host.sql`INSERT INTO chats (id, title, updated_at)
      VALUES (${id}, ${title}, ${now})
      ON CONFLICT (id) DO UPDATE SET title = excluded.title,
        updated_at = excluded.updated_at`;
    if (running !== null) this.setRunning(id, running);
    this.index.put(id, messages);
  }

  /** Rewrites a chat's search entries without touching its date. */
  reindex(id: string, messages: UIMessage[]) {
    this.index.put(id, messages);
  }

  setRunning(id: string, running: boolean) {
    this.host
      .sql`UPDATE chats SET running_since = ${running ? Date.now() : null}
      WHERE id = ${id}`;
  }

  /**
   * Names a chat once it has a first exchange. A failure keeps the
   * first-message title, and the next reply tries again.
   */
  async autoTitle(ai: Ai, id: string, messages: UIMessage[]) {
    if (this.namedTitle(id)) return;
    if (!messages.some((m) => m.role === "assistant")) return;
    let title: string | null = null;
    try {
      title = await generateTitle(ai, messages);
    } catch (error) {
      // Cosmetic: the list keeps the first-message title.
      console.error(`Chat title failed: ${String(error)}`);
    }
    // The chat may have been deleted while the model was thinking.
    if (!title || !this.ids().has(id)) return;
    this.host.sql`INSERT OR REPLACE INTO chat_state (key, value)
      VALUES (${`title:${id}`}, ${title})`;
    this.host.sql`UPDATE chats SET title = ${title} WHERE id = ${id}`;
  }

  list(): ChatSummary[] {
    const active = this.activeId();
    const now = Date.now();
    return this.host.sql<{
      id: string;
      title: string;
      updated_at: string;
      running_since: number | null;
    }>`SELECT id, title, updated_at, running_since FROM chats
       ORDER BY updated_at DESC`.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
      active: row.id === active,
      running:
        row.running_since !== null &&
        now - row.running_since < RUNNING_TIMEOUT_MS
    }));
  }

  remove(id: string) {
    this.host.sql`DELETE FROM chat_messages WHERE chat_id = ${id}`;
    this.host.sql`DELETE FROM chats WHERE id = ${id}`;
    this.host.sql`DELETE FROM chat_state WHERE key = ${`title:${id}`}`;
    this.index.drop(id);
    if (id === this.activeId()) this.setActive(crypto.randomUUID());
  }

  /** Earlier chats matching `query`, outside the chat asking. */
  search(query: string, exceptId: string) {
    return this.index.search(query, exceptId);
  }

  /**
   * The history list filtered to chats whose title or text contains `query`
   * (the `searchChats` callable), each with a snippet around the match.
   */
  find(query: unknown): ChatSummary[] {
    const needle = checkQuery(query);
    const all = this.list();
    if (!needle) return all;
    const texts = this.index.firstMatches(needle);
    const results: ChatSummary[] = [];
    for (const chat of all) {
      const snippet = chatMatch(chat.title, texts.get(chat.id), needle);
      if (snippet !== null) results.push({ ...chat, snippet });
    }
    return results.slice(0, SEARCH_RESULTS);
  }

  /** The messages around `seq` in a saved chat. */
  read(id: string, seq: number) {
    checkChatId(id);
    return this.index.read(id, seq);
  }
}
