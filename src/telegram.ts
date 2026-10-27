import { DurableObject } from "cloudflare:workers";
import { getAgentByName } from "agents";
import { isAllowed, jsonResponse, type User } from "./auth";

/**
 * Telegram ingress for the personal assistant.
 *
 * One bot serves every account. A Telegram user reaches an assistant only
 * after linking their Telegram account to a signed-in Google account: the web
 * app hands out a one-time `t.me/<bot>?start=<code>` link, and pressing Start
 * redeems the code. The Worker verifies Telegram's secret header, looks up
 * which account the sender is linked to, and forwards the update to that
 * account's Think assistant, which replies through its messenger runtime.
 * Unlinked senders and group chats never reach an assistant.
 */

export const TELEGRAM_WEBHOOK_PATH = "/messengers/telegram/webhook";
const CODE_TTL_MS = 10 * 60 * 1000;

// ── Link directory ────────────────────────────────────────────────────

/**
 * A single global Durable Object that maps Telegram user ids to Google
 * account ids and holds pending one-time link codes.
 */
export class TelegramLinks extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // The email is kept so ALLOWED_EMAILS can be re-checked per message.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS link_codes (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS links (
      telegram_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL
    )`);
  }

  createCode(userId: string, email: string) {
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM link_codes WHERE expires_at < ?", Date.now());
    sql.exec("DELETE FROM link_codes WHERE user_id = ?", userId);
    const code = crypto.randomUUID().replace(/-/g, "");
    sql.exec(
      "INSERT INTO link_codes (code, user_id, email, expires_at) VALUES (?, ?, ?, ?)",
      code,
      userId,
      email,
      Date.now() + CODE_TTL_MS
    );
    return code;
  }

  /** Redeems a code for a Telegram user; returns the linked account id. */
  redeem(code: string, telegramId: string) {
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec<{ user_id: string; email: string }>(
        "SELECT user_id, email FROM link_codes WHERE code = ? AND expires_at >= ?",
        code,
        Date.now()
      )
      .toArray()[0];
    if (!row) return null;
    sql.exec("DELETE FROM link_codes WHERE code = ?", code);
    // One Telegram account per Google account, and vice versa.
    sql.exec(
      "DELETE FROM links WHERE telegram_id = ? OR user_id = ?",
      telegramId,
      row.user_id
    );
    sql.exec(
      "INSERT INTO links (telegram_id, user_id, email) VALUES (?, ?, ?)",
      telegramId,
      row.user_id,
      row.email
    );
    return row.user_id;
  }

  userFor(telegramId: string) {
    return (
      this.ctx.storage.sql
        .exec<{
          user_id: string;
          email: string;
        }>("SELECT user_id, email FROM links WHERE telegram_id = ?", telegramId)
        .toArray()[0] ?? null
    );
  }

  /** The linked Telegram user id, which is also their private chat id. */
  telegramFor(userId: string) {
    return (
      this.ctx.storage.sql
        .exec<{
          telegram_id: string;
        }>("SELECT telegram_id FROM links WHERE user_id = ?", userId)
        .toArray()[0]?.telegram_id ?? null
    );
  }

  isLinked(userId: string) {
    return (
      this.ctx.storage.sql
        .exec("SELECT 1 FROM links WHERE user_id = ?", userId)
        .toArray().length > 0
    );
  }

  unlink(userId: string) {
    this.ctx.storage.sql.exec("DELETE FROM links WHERE user_id = ?", userId);
  }
}

export function links(env: Env) {
  return env.TelegramLinks.get(env.TelegramLinks.idFromName("global"));
}

/** The assistant instance for a Google account (same key as the web app). */
function assistantFor(env: Env, userId: string) {
  return getAgentByName(env.Assistant, `google:${userId}`);
}

// ── Bot API ───────────────────────────────────────────────────────────

export async function callTelegram(
  env: Env,
  method: string,
  body: Record<string, unknown>
) {
  const res = await fetch(
    `${env.TELEGRAM_API_BASE_URL || "https://api.telegram.org"}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
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

/** Best-effort reply; a failure is logged rather than failing the webhook. */
async function sendText(env: Env, chatId: number | string, text: string) {
  try {
    await callTelegram(env, "sendMessage", { chat_id: chatId, text });
  } catch (error) {
    console.error(error);
  }
}

/**
 * Points the bot's webhook at this deployment if it isn't already. Telegram
 * only accepts public https:// URLs, so plain-http local dev is skipped.
 */
async function ensureWebhook(env: Env, origin: string) {
  if (!origin.startsWith("https://")) return;
  const url = `${origin}${TELEGRAM_WEBHOOK_PATH}`;
  const info = (await callTelegram(env, "getWebhookInfo", {})) as {
    url?: string;
  };
  if (info.url === url) return;
  await callTelegram(env, "setWebhook", {
    url,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET_TOKEN,
    allowed_updates: ["message", "edited_message", "callback_query"]
  });
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

// Telegram retries non-2xx responses, so anything we deliberately drop
// is still acknowledged.
const ok = () => new Response("ok");

export async function handleTelegramWebhook(request: Request, env: Env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!timingSafeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET_TOKEN)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.text();
  let update: TelegramUpdate;
  try {
    update = JSON.parse(body) as TelegramUpdate;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const message =
    update.message ?? update.edited_message ?? update.callback_query?.message;
  const fromId = update.callback_query?.from.id ?? message?.from?.id;
  // Only one-to-one chats with the bot; the assistant is personal.
  if (!message || !fromId || message.chat.type !== "private") return ok();

  const telegramId = String(fromId);
  const text = message.text?.trim() ?? "";

  if (text.startsWith("/start")) {
    const code = text.slice("/start".length).trim();
    const userId = code ? await links(env).redeem(code, telegramId) : null;
    if (userId) {
      await sendText(
        env,
        message.chat.id,
        "Connected ✓ This chat now talks to your Cot assistant — same memory and reminders as the web app."
      );
      return ok();
    }
  }

  const link = await links(env).userFor(telegramId);
  if (!link || !isAllowed(link.email, env)) {
    await sendText(
      env,
      message.chat.id,
      "This is a private assistant. Sign in to the Cot web app and choose “Connect Telegram” to link this account."
    );
    return ok();
  }

  const assistant = await assistantFor(env, link.user_id);
  return assistant.fetch(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body
    })
  );
}

// ── Web app endpoints (signed-in user) ───────────────────────────────

export async function handleTelegramApi(
  request: Request,
  env: Env,
  user: User
) {
  const userId = user.id;
  const { pathname, origin } = new URL(request.url);

  if (pathname === "/telegram/status" && request.method === "GET") {
    return jsonResponse({
      linked: await links(env).isLinked(userId),
      botUsername: env.TELEGRAM_BOT_USERNAME
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (pathname === "/telegram/link") {
    await ensureWebhook(env, origin);
    const code = await links(env).createCode(userId, user.email);
    return jsonResponse({
      url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${code}`
    });
  }

  if (pathname === "/telegram/unlink") {
    await links(env).unlink(userId);
    return jsonResponse({ linked: false });
  }

  return new Response("Not found", { status: 404 });
}
