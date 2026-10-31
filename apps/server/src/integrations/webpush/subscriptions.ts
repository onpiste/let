import type { Agent } from "agents";

import type { WebPushSubscription } from "@cot/shared";

/** More than enough browsers for one person; old ones fall off the end. */
const MAX_SUBSCRIPTIONS = 10;

type Row = { endpoint: string; p256dh: string; auth: string };

/** The owner's browsers, in the assistant's own SQLite. */
export class WebPushSubscriptions {
  constructor(private readonly db: Pick<Agent<Env>, "sql">) {}

  private ensureTable() {
    this.db.sql`CREATE TABLE IF NOT EXISTS web_push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`;
  }

  list(): WebPushSubscription[] {
    this.ensureTable();
    return this.db.sql<Row>`
      SELECT endpoint, p256dh, auth FROM web_push_subscriptions`.map((row) => ({
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth }
    }));
  }

  save({ endpoint, keys }: WebPushSubscription) {
    this.ensureTable();
    this.db.sql`INSERT OR REPLACE INTO web_push_subscriptions
      (endpoint, p256dh, auth, updated_at)
      VALUES (${endpoint}, ${keys.p256dh}, ${keys.auth}, datetime('now'))`;
    this.db.sql`DELETE FROM web_push_subscriptions WHERE endpoint NOT IN (
      SELECT endpoint FROM web_push_subscriptions
      ORDER BY updated_at DESC LIMIT ${MAX_SUBSCRIPTIONS})`;
  }

  remove(endpoint: string) {
    this.ensureTable();
    this.db
      .sql`DELETE FROM web_push_subscriptions WHERE endpoint = ${endpoint}`;
  }
}
