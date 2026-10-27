import type { Agent } from "agents";

import { DEFAULT_SETTINGS, type Settings } from "@cot/shared";

import type { EmailConfig } from "../../integrations/email/config";
import type { TelegramConfig } from "../../integrations/telegram/config";
import type { Memory } from "../common/prompt";
import type { UsageRecord } from "../common/usage";

type SettingsKey =
  | "settings"
  | "owner_email"
  | "owner_name"
  | "telegram"
  | "email"
  | "usage";

/**
 * The Think assistant's own SQLite tables: `memories`, and a key/value
 * `settings` table for the user's settings, owner email, Telegram bot and
 * email address, and message usage (shared with the Pi assistant).
 */
export class AssistantStore {
  constructor(private readonly db: Pick<Agent<Env>, "sql">) {}

  // Think calls getMessengers() before onStart(), so anything that reads
  // these tables first makes sure they exist.
  ensureTables() {
    this.db.sql`CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`;
    this.db.sql`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`;
  }

  // ── Key/value ───────────────────────────────────────────────────────

  private read(key: SettingsKey) {
    const [row] = this.db.sql<{ value: string }>`
      SELECT value FROM settings WHERE key = ${key}`;
    return row?.value ?? null;
  }

  private write(key: SettingsKey, value: string) {
    this.db.sql`INSERT OR REPLACE INTO settings (key, value)
      VALUES (${key}, ${value})`;
  }

  private remove(key: SettingsKey) {
    this.db.sql`DELETE FROM settings WHERE key = ${key}`;
  }

  getSettings(): Settings {
    const value = this.read("settings");
    return value
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(value) as Partial<Settings>) }
      : DEFAULT_SETTINGS;
  }

  saveSettings(settings: Settings) {
    this.write("settings", JSON.stringify(settings));
  }

  getOwnerEmail() {
    return this.read("owner_email");
  }

  getOwnerName() {
    return this.read("owner_name");
  }

  setOwner(email: string, name: string) {
    this.write("owner_email", email);
    this.write("owner_name", name);
  }

  getTelegramConfig(): TelegramConfig | null {
    const value = this.read("telegram");
    return value ? (JSON.parse(value) as TelegramConfig) : null;
  }

  saveTelegramConfig(config: TelegramConfig | null) {
    if (config) this.write("telegram", JSON.stringify(config));
    else this.remove("telegram");
  }

  getEmailConfig(): EmailConfig | null {
    const value = this.read("email");
    return value ? (JSON.parse(value) as EmailConfig) : null;
  }

  saveEmailConfig(config: EmailConfig) {
    this.write("email", JSON.stringify(config));
  }

  getUsage(): UsageRecord | null {
    const value = this.read("usage");
    return value ? (JSON.parse(value) as UsageRecord) : null;
  }

  saveUsage(usage: UsageRecord) {
    this.write("usage", JSON.stringify(usage));
  }

  // ── Memories ────────────────────────────────────────────────────────

  listMemories() {
    return this.db.sql<Memory>`SELECT id, content FROM memories ORDER BY id`;
  }

  addMemory(content: string) {
    this.db.sql`INSERT INTO memories (content) VALUES (${content})`;
  }

  removeMemory(id: number) {
    this.db.sql`DELETE FROM memories WHERE id = ${id}`;
  }
}
