import type { TelegramConfig } from "./config";

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
