import { log } from "../../log/logger";

/**
 * The Bot API base. Pass this, never `undefined`, to the Think messenger:
 * its adapter falls back to `process.env.TELEGRAM_API_BASE_URL` with `??`,
 * and nodejs_compat sets that to the empty var, which breaks every call.
 */
export function telegramApiBase(env: Env) {
  return env.TELEGRAM_API_BASE_URL || "https://api.telegram.org";
}

export async function callTelegram(
  env: Env,
  token: string,
  method: string,
  body: Record<string, unknown>
) {
  const res = await fetch(`${telegramApiBase(env)}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
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
    log.error("telegram", "sendMessage failed", error);
  }
}
