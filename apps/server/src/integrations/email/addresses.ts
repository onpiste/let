import { DurableObject } from "cloudflare:workers";

/**
 * A single global Durable Object mapping address aliases (the part before
 * the @) to accounts. The alias is random, so an address reveals nothing
 * about the account and can't be guessed from another one.
 */
export class EmailAddresses extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS addresses (
      alias TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE
    )`);
  }

  set(alias: string, userId: string) {
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM addresses WHERE user_id = ?", userId);
    sql.exec(
      "INSERT INTO addresses (alias, user_id) VALUES (?, ?)",
      alias,
      userId
    );
  }

  userFor(alias: string) {
    return (
      this.ctx.storage.sql
        .exec<{
          user_id: string;
        }>("SELECT user_id FROM addresses WHERE alias = ?", alias)
        .toArray()[0]?.user_id ?? null
    );
  }
}

export function addresses(env: Env) {
  return env.EmailAddresses.get(env.EmailAddresses.idFromName("global"));
}
