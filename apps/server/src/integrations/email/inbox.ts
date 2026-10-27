import type { Agent } from "agents";

import type { ParsedEmail } from "./parse";

/** Older emails are deleted once the inbox holds this many. */
const MAX_EMAILS = 200;

export type InboxSummary = {
  id: number;
  receivedAt: string;
  from: string;
  subject: string;
};

export type InboxEmail = InboxSummary & {
  date: string | null;
  body: string;
  attachments: string[];
};

/** The assistant's received emails, in its own SQLite. */
export class Inbox {
  constructor(private readonly db: Pick<Agent<Env>, "sql">) {
    this.db.sql`CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      sender TEXT NOT NULL,
      subject TEXT NOT NULL,
      sent_at TEXT,
      body TEXT NOT NULL,
      attachments TEXT NOT NULL
    )`;
  }

  add(email: ParsedEmail) {
    this.db.sql`INSERT INTO emails (sender, subject, sent_at, body, attachments)
      VALUES (${email.from}, ${email.subject}, ${email.date},
        ${email.body}, ${JSON.stringify(email.attachments)})`;
    this.db.sql`DELETE FROM emails WHERE id <= (
      SELECT id FROM emails ORDER BY id DESC LIMIT 1 OFFSET ${MAX_EMAILS})`;
  }

  list(limit: number): InboxSummary[] {
    return this.db.sql<InboxSummary>`
      SELECT id, received_at AS receivedAt, sender AS "from", subject
      FROM emails ORDER BY id DESC LIMIT ${limit}`;
  }

  get(id: number): InboxEmail | null {
    const [row] = this.db.sql<
      Omit<InboxEmail, "attachments"> & { attachments: string }
    >`
      SELECT id, received_at AS receivedAt, sender AS "from", subject,
        sent_at AS date, body, attachments
      FROM emails WHERE id = ${id}`;
    if (!row) return null;
    // Written by add() above, so it is always a JSON string array.
    return { ...row, attachments: JSON.parse(row.attachments) as string[] };
  }
}
