import type { Agent } from "agents";

import type { EmailCategory, EmailDetail, EmailSummary } from "@cot/shared";

import type { ParsedEmail } from "./parse";

export type InboxSummary = EmailSummary;
export type InboxEmail = EmailDetail;

/** SQLite has no booleans; flags come back as 0 or 1. */
type SummaryRow = Omit<EmailSummary, "trusted" | "read" | "archived"> & {
  trusted: number;
  read: number;
  archived: number;
};

function toSummary(row: SummaryRow): EmailSummary {
  return {
    id: row.id,
    receivedAt: row.receivedAt,
    from: row.from,
    trusted: row.trusted === 1,
    subject: row.subject,
    category: row.category,
    summary: row.summary,
    read: row.read === 1,
    archived: row.archived === 1
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
      attachments TEXT NOT NULL
    )`;
    // Inboxes created before triage, read state or the archive lack these.
    const columns = new Set(
      this.db.sql<{ name: string }>`
        SELECT name FROM pragma_table_info('emails')`.map((c) => c.name)
    );
    // Identifiers can't be bound, so each column has its own statement.
    if (!columns.has("category")) {
      this.db.sql`ALTER TABLE emails ADD COLUMN category TEXT`;
      this.db.sql`ALTER TABLE emails ADD COLUMN summary TEXT`;
    }
    if (!columns.has("read_at")) {
      this.db.sql`ALTER TABLE emails ADD COLUMN read_at TEXT`;
    }
    if (!columns.has("message_id")) {
      this.db.sql`ALTER TABLE emails ADD COLUMN message_id TEXT`;
    }
    if (!columns.has("archived")) {
      this.db.sql`ALTER TABLE emails
        ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`;
    }
    this.db.sql`CREATE INDEX IF NOT EXISTS emails_by_trust_and_time
      ON emails (trusted, received_at)`;
  }

  /** Returns the new email's id. */
  add(email: ParsedEmail, trusted: boolean) {
    const [row] = this.db.sql<{ id: number }>`INSERT INTO emails
        (sender, trusted, subject, sent_at, body, attachments, message_id)
      VALUES (${email.from}, ${trusted ? 1 : 0}, ${email.subject},
        ${email.date}, ${email.body}, ${JSON.stringify(email.attachments)},
        ${email.messageId})
      RETURNING id`;
    if (!row) throw new Error("Could not file the email.");
    return row.id;
  }

  /** The Message-ID header a reply cites; null if the sender set none. */
  messageId(id: number) {
    const [row] = this.db.sql<{ messageId: string | null }>`
      SELECT message_id AS messageId FROM emails WHERE id = ${id}`;
    if (!row) throw new Error(`No email with id ${id}.`);
    return row.messageId;
  }

  setTriage(id: number, category: EmailCategory, summary: string) {
    this.db.sql`UPDATE emails SET category = ${category}, summary = ${summary}
      WHERE id = ${id}`;
  }

  markRead(id: number) {
    this.db.sql`UPDATE emails SET read_at = datetime('now')
      WHERE id = ${id} AND read_at IS NULL`;
  }

  markAllRead() {
    this.db.sql`UPDATE emails SET read_at = datetime('now')
      WHERE read_at IS NULL`;
  }

  setArchived(id: number, archived: boolean) {
    this.db.sql`UPDATE emails SET archived = ${archived ? 1 : 0}
      WHERE id = ${id}`;
  }

  /** Unread mail outside the archive. */
  unreadCount() {
    const [row] = this.db.sql<{ count: number }>`
      SELECT count(*) AS count FROM emails
      WHERE read_at IS NULL AND archived = 0`;
    return row?.count ?? 0;
  }

  /** Strangers' emails received since `window`, e.g. `-1 hour`. */
  countStrangersSince(window: string) {
    const [row] = this.db.sql<{ count: number }>`
      SELECT count(*) AS count FROM emails
      WHERE trusted = 0 AND received_at > datetime('now', ${window})`;
    return row?.count ?? 0;
  }

  /**
   * Newest first; `offset` pages back through older mail. `archived` keeps
   * to the inbox (false) or the archive (true); left out, both.
   */
  list(limit: number, offset: number, archived?: boolean): EmailSummary[] {
    const only = archived === undefined ? -1 : archived ? 1 : 0;
    const rows = this.db.sql<SummaryRow>`
      SELECT id, received_at AS receivedAt, sender AS "from", trusted, subject,
        category, summary, read_at IS NOT NULL AS read, archived
      FROM emails WHERE ${only} = -1 OR archived = ${only}
      ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`;
    return rows.map(toSummary);
  }

  /** Newest first emails whose sender, subject, summary or body contain `text`. */
  search(text: string, limit: number): EmailSummary[] {
    // LIKE treats % and _ as wildcards; escape them so the text is literal.
    const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
    const rows = this.db.sql<SummaryRow>`
      SELECT id, received_at AS receivedAt, sender AS "from", trusted, subject,
        category, summary, read_at IS NOT NULL AS read, archived
      FROM emails
      WHERE sender LIKE ${pattern} ESCAPE '\\'
        OR subject LIKE ${pattern} ESCAPE '\\'
        OR summary LIKE ${pattern} ESCAPE '\\'
        OR body LIKE ${pattern} ESCAPE '\\'
      ORDER BY id DESC LIMIT ${limit}`;
    return rows.map(toSummary);
  }

  get(id: number): EmailDetail | null {
    const [row] = this.db.sql<
      SummaryRow & Pick<EmailDetail, "date" | "body"> & { attachments: string }
    >`
      SELECT id, received_at AS receivedAt, sender AS "from", trusted,
        subject, category, summary, read_at IS NOT NULL AS read, archived,
        sent_at AS date, body, attachments
      FROM emails WHERE id = ${id}`;
    if (!row) return null;
    return {
      ...toSummary(row),
      date: row.date,
      body: row.body,
      // Written by add() above, so it is always a JSON string array.
      attachments: JSON.parse(row.attachments) as string[]
    };
  }
}
