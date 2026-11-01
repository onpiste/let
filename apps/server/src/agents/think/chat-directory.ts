import type { Agent } from "agents";
import type { UIMessage } from "ai";

import { Chat } from "./chat";
import { migrateChats } from "./chat-migration";
import { checkChatId, type ChatHistory } from "./history";

/** An empty chat nobody wrote in is dropped after this long. */
const EMPTY_CHAT_MS = 24 * 60 * 60 * 1000;

/** The assistant, as far as managing its chat agents needs it. */
type Host = Pick<Agent<Env>, "sql" | "dynamicAgents"> & {
  getMessages(): Promise<UIMessage[]>;
  clearMessages(): Promise<void>;
};

/**
 * The assistant's side of its chats: creating, opening and deleting the
 * `Chat` agents (facets) and keeping the catalog (history.ts) in step. The
 * facet registry decides which chats exist; the catalog lists those with
 * messages. Every entry point first moves conversations saved before chats
 * were separate agents (chat-migration.ts), once per wake.
 */
export class ChatDirectory {
  private migration: Promise<void> | null = null;

  constructor(
    private readonly host: Host,
    private readonly history: () => ChatHistory
  ) {}

  ready() {
    this.migration ??= migrateChats(
      {
        sql: this.host.sql.bind(this.host),
        getMessages: () => this.host.getMessages(),
        clearMessages: () => this.host.clearMessages(),
        chat: (id) => this.chat(id)
      },
      this.history()
    ).catch((error: unknown) => {
      // Try again on the next call rather than staying broken.
      this.migration = null;
      throw error;
    });
    return this.migration;
  }

  /** The chat agent with this id, created if needed. */
  private chat(id: string) {
    return this.host.dynamicAgents.get(Chat, id);
  }

  exists(id: string) {
    return this.host.dynamicAgents.has(Chat, id);
  }

  async list() {
    await this.ready();
    return this.history().list();
  }

  async current() {
    await this.ready();
    const id = this.history().activeId();
    await this.chat(id);
    return id;
  }

  async create() {
    await this.ready();
    await this.dropEmpty();
    const id = crypto.randomUUID();
    await this.chat(id);
    return id;
  }

  async open(id: unknown) {
    checkChatId(id);
    await this.ready();
    if (!this.exists(id)) throw new Error("That chat no longer exists.");
    this.history().setActive(id);
    return this.history().list();
  }

  /** Deleting the agent also stops a reply still running in it. */
  async remove(id: unknown) {
    checkChatId(id);
    await this.ready();
    await this.host.dynamicAgents.delete(Chat, id);
    this.history().remove(id);
    return this.history().list();
  }

  async find(query: unknown) {
    await this.ready();
    return this.history().find(query);
  }

  /** Adds a message to a chat (null or gone: the one in use), no turn. */
  async post(chatId: string | null, message: UIMessage) {
    const id = chatId && this.exists(chatId) ? chatId : await this.current();
    await (await this.chat(id)).addReport(message);
  }

  /** Chats opened but never written in, except the one in use. */
  private async dropEmpty() {
    const used = this.history().ids();
    const active = this.history().activeId();
    const stale = this.host.dynamicAgents
      .list(Chat)
      .filter(
        (chat) =>
          Date.now() - chat.createdAt > EMPTY_CHAT_MS &&
          !used.has(chat.name) &&
          chat.name !== active
      );
    await Promise.all(
      stale.map((chat) => this.host.dynamicAgents.delete(Chat, chat.name))
    );
  }
}
