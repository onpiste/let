import { DurableObject } from "cloudflare:workers";

/**
 * A single global Durable Object mapping address aliases (the part before
 * the @) to accounts. Aliases are first come, first served; one Durable
 * Object runs one call at a time, so a claim can't race another.
 */
export class EmailAddresses extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS addresses (
      alias TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE
    )`);
  }

  /**
   * Gives `alias` to the account, releasing its previous one. False when
   * another account holds it.
   */
  claim(alias: string, userId: string) {
    const owner = this.userFor(alias);
    if (owner === userId) return true;
    if (owner) return false;
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM addresses WHERE user_id = ?", userId);
    sql.exec(
      "INSERT INTO addresses (alias, user_id) VALUES (?, ?)",
      alias,
      userId
    );
    return true;
  }

  /** The first alias in `candidates` still free, claimed; else null. */
  claimFirst(candidates: string[], userId: string) {
    return candidates.find((alias) => this.claim(alias, userId)) ?? null;
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
