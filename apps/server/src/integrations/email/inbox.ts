import type { Agent } from "agents";

import type { ParsedEmail } from "./parse";

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
    this.db.sql`CREATE INDEX IF NOT EXISTS emails_by_trust_and_time
      ON emails (trusted, received_at)`;
  }

  add(email: ParsedEmail, trusted: boolean) {
    this.db.sql`INSERT INTO emails
        (sender, trusted, subject, sent_at, body, attachments)
      VALUES (${email.from}, ${trusted ? 1 : 0}, ${email.subject},
        ${email.date}, ${email.body}, ${JSON.stringify(email.attachments)})`;
  }

  /** Strangers' emails received since `window`, e.g. `-1 hour`. */
  countStrangersSince(window: string) {
    const [row] = this.db.sql<{ count: number }>`
      SELECT count(*) AS count FROM emails
      WHERE trusted = 0 AND received_at > datetime('now', ${window})`;
    return row?.count ?? 0;
  }

  /** Newest first; `offset` pages back through older mail. */
  list(limit: number, offset: number): InboxSummary[] {
    const rows = this.db.sql<SummaryRow>`
      SELECT id, received_at AS receivedAt, sender AS "from", trusted, subject
      FROM emails ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`;
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
