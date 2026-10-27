import { getAgentByName } from "agents";
import { DurableObject } from "cloudflare:workers";

import type { TelegramStatus } from "@cot/shared";

/**
 * Telegram for the personal assistant: each user brings their own bot.
 *
 * The user pastes a @BotFather token on the settings page. Their assistant
 * keeps the token and points the bot's webhook at
 * `/messengers/telegram/<routeId>/webhook`, with a random secret. The Worker
 * maps the route id to the account (TelegramRoutes) and hands the update to
 * that account's assistant, which checks the secret and lets through only the
 * bot's owner: the Telegram user who claimed it with `/start <code>`. Think's
 * messenger runtime then replies in the same conversation as the web chat.
 */

/** The path Think's messenger runtime serves for the `telegram` messenger. */
export const THINK_WEBHOOK_PATH = "/messengers/telegram/webhook";
const ROUTE_PATTERN = /^\/messengers\/telegram\/([a-f0-9]{32})\/webhook$/;
const CLAIM_TTL_MS = 30 * 60 * 1000;

export function webhookPath(routeId: string) {
  return `/messengers/telegram/${routeId}/webhook`;
}

/** A user's bot, stored in their assistant. The token never leaves it. */
export type TelegramConfig = {
  token: string;
  botUsername: string;
  webhookSecret: string;
  routeId: string;
  /** Whether setWebhook succeeded (it needs a public https:// origin). */
  webhookSet: boolean;
  /** The Telegram user who claimed the bot; only they reach the assistant. */
  ownerId: string | null;
  claimCode: string | null;
  claimExpiresAt: number;
};

export function randomHex() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function newClaim(): Pick<
  TelegramConfig,
  "claimCode" | "claimExpiresAt"
> {
  return { claimCode: randomHex(), claimExpiresAt: Date.now() + CLAIM_TTL_MS };
}

export function toTelegramStatus(
  config: TelegramConfig | null
): TelegramStatus {
  if (!config) return { configured: false };
  const claimable =
    !config.ownerId && config.claimCode && config.claimExpiresAt > Date.now();
  return {
    configured: true,
    botUsername: config.botUsername,
    webhookSet: config.webhookSet,
    linked: Boolean(config.ownerId),
    claimUrl: claimable
      ? `https://t.me/${config.botUsername}?start=${config.claimCode}`
      : null
  };
}

// ── Route directory ───────────────────────────────────────────────────

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

// ── Bot API ───────────────────────────────────────────────────────────

export async function callTelegram(
  env: Env,
  token: string,
  method: string,
  body: Record<string, unknown>
) {
  const res = await fetch(
    `${env.TELEGRAM_API_BASE_URL || "https://api.telegram.org"}/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const payload = (await res.json()) as {
    ok: boolean;
    result?: unknown;
    description?: string;
  };
  if (!payload.ok) {
    throw new Error(`Telegram ${method} failed: ${payload.description}`);
  }
  return payload.result;
}

/** Best-effort message; a failure is logged rather than thrown. */
export async function sendText(
  env: Env,
  token: string,
  chatId: number | string,
  text: string
) {
  try {
    await callTelegram(env, token, "sendMessage", { chat_id: chatId, text });
  } catch (error) {
    console.error(error);
  }
}

// ── Webhook ───────────────────────────────────────────────────────────

type TelegramUpdate = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: {
    from: { id: number };
    message?: TelegramMessage;
  };
};
type TelegramMessage = {
  text?: string;
  from?: { id: number };
  chat: { id: number; type: string };
};

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type GateDecision =
  | { kind: "unauthorized" }
  | { kind: "ignore" }
  | { kind: "claim"; chatId: number; ownerId: string }
  | { kind: "reject"; chatId: number }
  | { kind: "forward" };

/**
 * Decides what to do with an update for a user's bot: verify Telegram's
 * secret header, keep to one-to-one chats, let `/start <code>` claim an
 * unclaimed bot, and pass on only the owner's messages.
 */
export function gateUpdate(
  config: TelegramConfig,
  secret: string,
  body: string
): GateDecision {
  if (!timingSafeEqual(secret, config.webhookSecret)) {
    return { kind: "unauthorized" };
  }
  let update: TelegramUpdate;
  try {
    update = JSON.parse(body) as TelegramUpdate;
  } catch {
    return { kind: "ignore" };
  }
  const message =
    update.message ?? update.edited_message ?? update.callback_query?.message;
  const fromId = update.callback_query?.from.id ?? message?.from?.id;
  if (!message || !fromId || message.chat.type !== "private") {
    return { kind: "ignore" };
  }

  const telegramId = String(fromId);
  if (config.ownerId === telegramId) return { kind: "forward" };

  const text = message.text?.trim() ?? "";
  if (
    !config.ownerId &&
    config.claimCode &&
    config.claimExpiresAt > Date.now() &&
    text.startsWith("/start") &&
    timingSafeEqual(text.slice("/start".length).trim(), config.claimCode)
  ) {
    return { kind: "claim", chatId: message.chat.id, ownerId: telegramId };
  }
  return { kind: "reject", chatId: message.chat.id };
}

/** Telegram retries non-2xx responses, so dropped updates still get 200. */
const ok = () => new Response("ok");

export async function handleTelegramWebhook(request: Request, env: Env) {
  const url = new URL(request.url);
  const routeId = ROUTE_PATTERN.exec(url.pathname)?.[1];
  if (!routeId) return new Response("Not found", { status: 404 });
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const userId = await routes(env).userFor(routeId);
  if (!userId) return new Response("Not found", { status: 404 });

  const assistant = await getAgentByName(env.Assistant, `google:${userId}`);
  const body = await request.text();
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  const result = await assistant.receiveTelegramUpdate(secret, body);
  if (result === "unauthorized") {
    return new Response("Unauthorized", { status: 401 });
  }
  if (result === "handled") return ok();

  // Hand the update to Think's messenger runtime on its own route.
  return assistant.fetch(
    new Request(`${url.origin}${THINK_WEBHOOK_PATH}`, {
      method: "POST",
      headers: request.headers,
      body
    })
  );
}
