import { DurableObject } from "cloudflare:workers";

/** The path Think's messenger runtime serves for the `telegram` messenger. */
export const THINK_WEBHOOK_PATH = "/messengers/telegram/webhook";
export const ROUTE_PATTERN =
  /^\/messengers\/telegram\/([a-f0-9]{32})\/webhook$/;

export function webhookPath(routeId: string) {
  return `/messengers/telegram/${routeId}/webhook`;
}

/** A single global Durable Object mapping webhook route ids to accounts. */
export class TelegramRoutes extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS routes (
      route_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE
    )`);
  }

  set(routeId: string, userId: string) {
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM routes WHERE user_id = ?", userId);
    sql.exec(
      "INSERT INTO routes (route_id, user_id) VALUES (?, ?)",
      routeId,
      userId
    );
  }

  userFor(routeId: string) {
    return (
      this.ctx.storage.sql
        .exec<{
          user_id: string;
        }>("SELECT user_id FROM routes WHERE route_id = ?", routeId)
        .toArray()[0]?.user_id ?? null
    );
  }

  remove(userId: string) {
    this.ctx.storage.sql.exec("DELETE FROM routes WHERE user_id = ?", userId);
  }
}

export function routes(env: Env) {
  return env.TelegramRoutes.get(env.TelegramRoutes.idFromName("global"));
}
