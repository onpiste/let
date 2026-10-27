import type { Agent } from "agents";

import type { ParsedEmail } from "./parse";

/** Older emails are deleted once the inbox holds this many. */
const MAX_EMAILS = 200;

export type InboxSummary = {
  id: number;
  receivedAt: string;
  from: string;
  /** From the owner or a trusted sender rather than a stranger. */
  trusted: boolean;
  subject: string;
};

export type InboxEmail = InboxSummary & {
  date: string | null;
  body: string;
  attachments: string[];
};

/** SQLite has no booleans; `trusted` comes back as 0 or 1. */
type SummaryRow = Omit<InboxSummary, "trusted"> & { trusted: number };

/** The assistant's received emails, in its own SQLite. */
export class Inbox {
  constructor(private readonly db: Pick<Agent<Env>, "sql">) {
    this.db.sql`CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      sender TEXT NOT NULL,
      trusted INTEGER NOT NULL,
      subject TEXT NOT NULL,
      sent_at TEXT,
      body TEXT NOT NULL,
      attachments TEXT NOT NULL
    )`;
  }

  add(email: ParsedEmail, trusted: boolean) {
    this.db.sql`INSERT INTO emails
        (sender, trusted, subject, sent_at, body, attachments)
      VALUES (${email.from}, ${trusted ? 1 : 0}, ${email.subject},
        ${email.date}, ${email.body}, ${JSON.stringify(email.attachments)})`;
    this.db.sql`DELETE FROM emails WHERE id <= (
      SELECT id FROM emails ORDER BY id DESC LIMIT 1 OFFSET ${MAX_EMAILS})`;
  }

  list(limit: number): InboxSummary[] {
    const rows = this.db.sql<SummaryRow>`
      SELECT id, received_at AS receivedAt, sender AS "from", trusted, subject
      FROM emails ORDER BY id DESC LIMIT ${limit}`;
    return rows.map((row) => ({
      id: row.id,
      receivedAt: row.receivedAt,
      from: row.from,
      trusted: row.trusted === 1,
      subject: row.subject
    }));
  }

  get(id: number): InboxEmail | null {
    const [row] = this.db.sql<
      SummaryRow & Pick<InboxEmail, "date" | "body"> & { attachments: string }
    >`
      SELECT id, received_at AS receivedAt, sender AS "from", trusted,
        subject, sent_at AS date, body, attachments
      FROM emails WHERE id = ${id}`;
    if (!row) return null;
    return {
      ...row,
      trusted: row.trusted === 1,
      // Written by add() above, so it is always a JSON string array.
      attachments: JSON.parse(row.attachments) as string[]
    };
  }
}
