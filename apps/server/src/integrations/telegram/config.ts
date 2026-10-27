import type { TelegramStatus } from "@cot/shared";

const CLAIM_TTL_MS = 30 * 60 * 1000;

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
