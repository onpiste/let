import type { Agent } from "agents";

import type { EmailCategory } from "@cot/shared";

import type { ParsedEmail } from "./parse";

export type InboxSummary = {
  id: number;
  receivedAt: string;
  from: string;
  /** From the owner or a trusted sender rather than a stranger. */
  trusted: boolean;
  subject: string;
  /** How the assistant sorted it; null until (or unless) it has. */
  category: EmailCategory | null;
  summary: string | null;
};

export type InboxEmail = InboxSummary & {
  date: string | null;
  body: string;
  attachments: string[];
};

/** SQLite has no booleans; `trusted` comes back as 0 or 1. */
type SummaryRow = Omit<InboxSummary, "trusted"> & { trusted: number };

function toSummary(row: SummaryRow): InboxSummary {
  return {
    id: row.id,
    receivedAt: row.receivedAt,
    from: row.from,
    trusted: row.trusted === 1,
    subject: row.subject,
    category: row.category,
    summary: row.summary
  };
}

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
      attachments TEXT NOT NULL,
      category TEXT,
      summary TEXT
    )`;
    // Inboxes created before triage lack these columns.
    const columns = this.db.sql<{ name: string }>`
      SELECT name FROM pragma_table_info('emails')`;
    if (!columns.some((column) => column.name === "category")) {
      this.db.sql`ALTER TABLE emails ADD COLUMN category TEXT`;
      this.db.sql`ALTER TABLE emails ADD COLUMN summary TEXT`;
    }
    this.db.sql`CREATE INDEX IF NOT EXISTS emails_by_trust_and_time
      ON emails (trusted, received_at)`;
  }

  /** Returns the new email's id. */
  add(email: ParsedEmail, trusted: boolean) {
    const [row] = this.db.sql<{ id: number }>`INSERT INTO emails
        (sender, trusted, subject, sent_at, body, attachments)
      VALUES (${email.from}, ${trusted ? 1 : 0}, ${email.subject},
        ${email.date}, ${email.body}, ${JSON.stringify(email.attachments)})
      RETURNING id`;
    if (!row) throw new Error("Could not file the email.");
    return row.id;
  }

  setTriage(id: number, category: EmailCategory, summary: string) {
    this.db.sql`UPDATE emails SET category = ${category}, summary = ${summary}
      WHERE id = ${id}`;
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
      SELECT id, received_at AS receivedAt, sender AS "from", trusted, subject,
        category, summary
      FROM emails ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`;
    return rows.map(toSummary);
  }

  /** Newest first emails whose sender, subject, summary or body contain `text`. */
  search(text: string, limit: number): InboxSummary[] {
    // LIKE treats % and _ as wildcards; escape them so the text is literal.
    const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
    const rows = this.db.sql<SummaryRow>`
      SELECT id, received_at AS receivedAt, sender AS "from", trusted, subject,
        category, summary
      FROM emails
      WHERE sender LIKE ${pattern} ESCAPE '\\'
        OR subject LIKE ${pattern} ESCAPE '\\'
        OR summary LIKE ${pattern} ESCAPE '\\'
        OR body LIKE ${pattern} ESCAPE '\\'
      ORDER BY id DESC LIMIT ${limit}`;
    return rows.map(toSummary);
  }

  get(id: number): InboxEmail | null {
    const [row] = this.db.sql<
      SummaryRow & Pick<InboxEmail, "date" | "body"> & { attachments: string }
    >`
      SELECT id, received_at AS receivedAt, sender AS "from", trusted,
        subject, category, summary, sent_at AS date, body, attachments
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
