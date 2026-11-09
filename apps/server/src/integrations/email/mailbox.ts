import type { UIMessage } from "ai";

import {
  INBOX_PAGE_SIZE,
  type EmailDetail,
  type InboxPage,
  type ServerEvent
} from "@cot/shared";

import type { Inbox } from "./inbox";

/** Ids and offsets come from the network; reject anything but a count. */
function checkCount(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a whole number.`);
  }
  return value;
}

/**
 * The message "Ask Cot" starts a chat with. It names the email by id only:
 * the subject and sender are written by someone else, and a user message is
 * the one place the model would take them as the owner's words. The model
 * reads the mail with `readEmail`, which fences the content as untrusted.
 */
function askMessage(id: number): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [
      {
        type: "text",
        text: `📧 Read email #${id} in your inbox and tell me what it is and what, if anything, I should do about it.`
      }
    ],
    metadata: { createdAt: Date.now() }
  };
}

/**
 * What the owner does with their mail from a client: page through it, open
 * one (marking it read), mark all read, archive one, or hand it to the
 * assistant. Every
 * change to the unread count goes out to open clients for their badge.
 */
export class Mailbox {
  constructor(
    private readonly options: {
      inbox: () => Inbox;
      broadcast: (event: ServerEvent) => void;
      /** Starts a new chat with the message; returns its id. */
      startChat: (message: UIMessage) => Promise<string>;
    }
  ) {}

  page(archived: unknown, offset: unknown): InboxPage {
    if (typeof archived !== "boolean") {
      throw new Error("archived must be true or false.");
    }
    const inbox = this.options.inbox();
    // One extra row says whether there is an older page.
    const rows = inbox.list(
      INBOX_PAGE_SIZE + 1,
      checkCount(offset, "offset"),
      archived
    );
    return {
      emails: rows.slice(0, INBOX_PAGE_SIZE),
      more: rows.length > INBOX_PAGE_SIZE,
      unread: inbox.unreadCount()
    };
  }

  open(id: unknown): EmailDetail | null {
    const inbox = this.options.inbox();
    const email = inbox.get(checkCount(id, "id"));
    if (!email) return null;
    if (!email.read) {
      inbox.markRead(email.id);
      this.changed(inbox);
    }
    return { ...email, read: true };
  }

  archive(id: unknown, archived: unknown) {
    if (typeof archived !== "boolean") {
      throw new Error("archived must be true or false.");
    }
    const inbox = this.options.inbox();
    inbox.setArchived(checkCount(id, "id"), archived);
    this.changed(inbox);
  }

  markAllRead() {
    const inbox = this.options.inbox();
    inbox.markAllRead();
    this.changed(inbox);
  }

  async ask(id: unknown) {
    const email = this.options.inbox().get(checkCount(id, "id"));
    if (!email) throw new Error("That email is no longer in the inbox.");
    // Asking about it counts as reading it.
    this.open(email.id);
    return this.options.startChat(askMessage(email.id));
  }

  private changed(inbox: Inbox) {
    this.options.broadcast({ type: "inbox", unread: inbox.unreadCount() });
  }
}
