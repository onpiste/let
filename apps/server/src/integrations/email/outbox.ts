import type { Agent } from "agents";

import type { EmailDraft } from "@cot/shared";

/** The mail the assistant has sent for its owner, in its own SQLite. */
export class Outbox {
  constructor(private readonly db: Pick<Agent<Env>, "sql">) {
    this.db.sql`CREATE TABLE IF NOT EXISTS sent_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      reply_to_email INTEGER,
      message_id TEXT
    )`;
  }

  add(draft: EmailDraft, messageId: string | null) {
    this.db.sql`INSERT INTO sent_emails
        (recipient, subject, body, reply_to_email, message_id)
      VALUES (${draft.to}, ${draft.subject}, ${draft.body},
        ${draft.inReplyTo ?? null}, ${messageId})`;
  }

  /** Mail sent since `window`, e.g. `-1 day`. */
  countSince(window: string) {
    const [row] = this.db.sql<{ count: number }>`
      SELECT count(*) AS count FROM sent_emails
      WHERE sent_at > datetime('now', ${window})`;
    return row?.count ?? 0;
  }
}
