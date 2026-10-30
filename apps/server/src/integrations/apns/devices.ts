import type { Agent } from "agents";

import type { PushDevice, PushEnvironment } from "@cot/shared";

/** More than enough phones for one person; old tokens fall off the end. */
const MAX_DEVICES = 10;

/** The owner's phones, in the assistant's own SQLite. */
export class PushDevices {
  constructor(private readonly db: Pick<Agent<Env>, "sql">) {}

  private ensureTable() {
    this.db.sql`CREATE TABLE IF NOT EXISTS push_devices (
      token TEXT PRIMARY KEY,
      environment TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`;
  }

  list(): PushDevice[] {
    this.ensureTable();
    return this.db.sql<{ token: string; environment: PushEnvironment }>`
      SELECT token, environment FROM push_devices`;
  }

  save(device: PushDevice) {
    this.ensureTable();
    this.db
      .sql`INSERT OR REPLACE INTO push_devices (token, environment, updated_at)
      VALUES (${device.token}, ${device.environment}, datetime('now'))`;
    this.db.sql`DELETE FROM push_devices WHERE token NOT IN (
      SELECT token FROM push_devices ORDER BY updated_at DESC LIMIT ${MAX_DEVICES})`;
  }

  remove(token: string) {
    this.ensureTable();
    this.db.sql`DELETE FROM push_devices WHERE token = ${token}`;
  }
}
