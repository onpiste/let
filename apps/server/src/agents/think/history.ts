import type { Agent } from "agents";
import type { UIMessage } from "ai";

import type { ChatSummary } from "@cot/shared";

import { generateTitle } from "./title";

/** The Think methods the history swaps conversations through. */
type Host = Pick<Agent<Env>, "sql"> & {
  getMessages(): Promise<UIMessage[]>;
  clearMessages(): Promise<void>;
  addMessages(messages: UIMessage[]): Promise<void>;
};

const TITLE_LENGTH = 60;
const INLINE_FILE = /<file name="([^"]*)">\n[\s\S]*?\n<\/file>\n?/g;

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
function checkId(id: unknown) {
  if (typeof id !== "string" || id.length > 64) throw new Error("Bad chat id.");
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
 * Saved conversations. Think holds one conversation, so history works by
 * swapping: the active one is snapshotted into SQLite (one row per message,
 * since a row is capped at 2 MB) and another is loaded back in its place.
 */
export class ChatHistory {
  constructor(private readonly host: Host) {}

  private ensureTables() {
    this.host.sql`CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
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
  }

  private activeId() {
    const [row] = this.host.sql<{ value: string }>`
      SELECT value FROM chat_state WHERE key = 'active'`;
    if (row) return row.value;
    return this.setActive(crypto.randomUUID());
  }

  private setActive(id: string) {
    this.host.sql`INSERT OR REPLACE INTO chat_state (key, value)
      VALUES ('active', ${id})`;
    return id;
  }

  /** A title the model wrote, which wins over the first-message fallback. */
  private namedTitle(id: string) {
    const [row] = this.host.sql<{ value: string }>`
      SELECT value FROM chat_state WHERE key = ${`title:${id}`}`;
    return row?.value ?? null;
  }

  private titleFor(id: string, messages: UIMessage[]) {
    return this.namedTitle(id) ?? chatTitle(messages);
  }

  /**
   * Names the active chat once it has a first exchange. A failure keeps the
   * first-message title, and the next reply tries again.
   */
  async autoTitle(ai: Ai) {
    this.ensureTables();
    const id = this.activeId();
    if (this.namedTitle(id)) return;
    const messages = await this.host.getMessages();
    if (!messages.some((m) => m.role === "assistant")) return;
    let title: string | null = null;
    try {
      title = await generateTitle(ai, messages);
    } catch (error) {
      // Cosmetic: the list keeps the first-message title.
      console.error(`Chat title failed: ${String(error)}`);
    }
    // The chat may have been swapped out while the model was thinking.
    if (!title || id !== this.activeId()) return;
    this.host.sql`INSERT OR REPLACE INTO chat_state (key, value)
      VALUES (${`title:${id}`}, ${title})`;
  }

  async list(): Promise<ChatSummary[]> {
    this.ensureTables();
    const active = this.activeId();
    const current = await this.host.getMessages();
    const saved = this.host.sql<{
      id: string;
      title: string;
      updated_at: string;
    }>`SELECT id, title, updated_at FROM chats
       WHERE id != ${active} ORDER BY updated_at DESC`;
    const list: ChatSummary[] = saved.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
      active: false
    }));
    if (current.length > 0) {
      list.unshift({
        id: active,
        title: this.titleFor(active, current),
        updatedAt: new Date().toISOString(),
        active: true
      });
    }
    return list;
  }

  /** Writes the active conversation to its snapshot (or drops it if empty). */
  private async archive() {
    const id = this.activeId();
    const messages = await this.host.getMessages();
    this.host.sql`DELETE FROM chat_messages WHERE chat_id = ${id}`;
    if (messages.length === 0) {
      this.host.sql`DELETE FROM chats WHERE id = ${id}`;
      this.host.sql`DELETE FROM chat_state WHERE key = ${`title:${id}`}`;
      return;
    }
    messages.forEach((message, seq) => {
      this.host.sql`INSERT INTO chat_messages (chat_id, seq, json)
        VALUES (${id}, ${seq}, ${JSON.stringify(message)})`;
    });
    this.host.sql`INSERT OR REPLACE INTO chats (id, title, updated_at)
      VALUES (${id}, ${this.titleFor(id, messages)}, ${new Date().toISOString()})`;
  }

  async create() {
    this.ensureTables();
    await this.archive();
    await this.host.clearMessages();
    this.setActive(crypto.randomUUID());
    return this.list();
  }

  async open(id: string) {
    checkId(id);
    this.ensureTables();
    if (id === this.activeId()) return this.list();
    const rows = this.host.sql<{ json: string }>`
      SELECT json FROM chat_messages WHERE chat_id = ${id} ORDER BY seq`;
    if (rows.length === 0) throw new Error("That chat no longer exists.");
    await this.archive();
    await this.host.clearMessages();
    // Parsed from our own earlier snapshot of Think's messages.
    await this.host.addMessages(
      rows.map((row) => JSON.parse(row.json) as UIMessage)
    );
    this.setActive(id);
    return this.list();
  }

  async remove(id: string) {
    checkId(id);
    this.ensureTables();
    if (id === this.activeId()) {
      await this.host.clearMessages();
      this.setActive(crypto.randomUUID());
    }
    this.host.sql`DELETE FROM chat_messages WHERE chat_id = ${id}`;
    this.host.sql`DELETE FROM chats WHERE id = ${id}`;
    this.host.sql`DELETE FROM chat_state WHERE key = ${`title:${id}`}`;
    return this.list();
  }
}
