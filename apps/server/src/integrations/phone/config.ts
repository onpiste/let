/**
 * Phone answering is optional and off unless both secrets are set (see
 * README.md). This is the spike's deployment-level setup: one Twilio number
 * answers for one account. Per-user numbers, set on the settings page like
 * the Telegram bot, replace it before this ships.
 */
type PhoneSecrets = {
  /** Twilio auth token: checks webhook signatures and signs stream URLs. */
  TWILIO_AUTH_TOKEN?: string;
  /** The Google account id (`/auth/me` → id) whose assistant answers. */
  PHONE_ACCOUNT?: string;
};

export type PhoneConfig = { authToken: string; account: string };

export function phoneConfig(env: Env): PhoneConfig | null {
  const secrets = env as Env & PhoneSecrets;
  const authToken = secrets.TWILIO_AUTH_TOKEN ?? "";
  const account = secrets.PHONE_ACCOUNT ?? "";
  if (!authToken || !account) return null;
  return { authToken, account };
}
