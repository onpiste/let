/**
 * Phone calls are optional and off unless all three secrets are set (see
 * README.md). This is the spike's deployment-level setup: one Twilio number
 * reaches one account. Per-user numbers, set on the settings page like the
 * Telegram bot, replace it before this ships.
 */
type PhoneSecrets = {
  /** Twilio auth token: checks webhook signatures and signs stream URLs. */
  TWILIO_AUTH_TOKEN?: string;
  /** The Google account id (`/auth/me` → id) whose assistant answers. */
  PHONE_ACCOUNT?: string;
  /** Comma-separated E.164 numbers allowed to call, e.g. +14155550100. */
  PHONE_CALLERS?: string;
};

export type PhoneConfig = {
  authToken: string;
  account: string;
  callers: Set<string>;
};

export function phoneConfig(env: Env): PhoneConfig | null {
  const secrets = env as Env & PhoneSecrets;
  const authToken = secrets.TWILIO_AUTH_TOKEN ?? "";
  const account = secrets.PHONE_ACCOUNT ?? "";
  const callers = new Set(
    (secrets.PHONE_CALLERS ?? "")
      .split(",")
      .map((number) => number.trim())
      .filter(Boolean)
  );
  if (!authToken || !account || callers.size === 0) return null;
  return { authToken, account, callers };
}
