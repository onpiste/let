import type { Agent } from "agents";
import type { UIMessage } from "ai";

import type { ChatHistory } from "./history";

/** The assistant, as far as moving its old conversations needs it. */
type Host = Pick<Agent<Env>, "sql"> & {
  getMessages(): Promise<UIMessage[]>;
  clearMessages(): Promise<void>;
  /** The chat agent with this id, created if needed. */
  chat(id: string): Promise<{
    importMessages(messages: UIMessage[]): Promise<void>;
  }>;
};

const DONE_KEY = "chats_split";

/**
 * Moves conversations from before each chat was its own agent. Back then the
 * assistant held the active conversation itself (Think's own messages) and
 * kept the others as snapshots in `chat_messages`. Each becomes a `Chat`
 * agent with the same id, so the history list and search index keep working.
 * Safe to repeat: a chat that was already imported is imported again whole.
 */
export async function migrateChats(host: Host, history: ChatHistory) {
  const [done] = host.sql<{ value: string }>`
    SELECT value FROM chat_state WHERE key = ${DONE_KEY}`;
  if (done) return;

  const current = await host.getMessages();
  if (current.length > 0) {
    const id = history.activeId();
    await (await host.chat(id)).importMessages(current);
    history.record(id, current, false);
    await host.clearMessages();
  }

  const saved = host.sql<{ chat_id: string }>`
    SELECT DISTINCT chat_id FROM chat_messages`;
  await Promise.all(
    saved.map(async ({ chat_id: id }) => {
      const rows = host.sql<{ json: string }>`
        SELECT json FROM chat_messages WHERE chat_id = ${id} ORDER BY seq`;
      // Parsed from our own earlier snapshot of Think's messages.
      const messages = rows.map((row) => JSON.parse(row.json) as UIMessage);
      await (await host.chat(id)).importMessages(messages);
      // The catalog row keeps its date; only the index is refreshed.
      history.reindex(id, messages);
      host.sql`DELETE FROM chat_messages WHERE chat_id = ${id}`;
    })
  );

  host.sql`INSERT OR REPLACE INTO chat_state (key, value)
    VALUES (${DONE_KEY}, '1')`;
}
