/** What the Worker needs to talk to APNs: a token-based auth key. */
export type ApnsConfig = {
  /** The .p8 key's contents (PEM). */
  key: string;
  keyId: string;
  teamId: string;
  /** The app's bundle id. */
  topic: string;
};

/**
 * The deployment's APNs key, or null when push isn't set up. APNS_KEY is an
 * optional secret, so `wrangler types` (which only lists required ones)
 * doesn't know it; it is read through a widened type here.
 */
export function apnsConfig(env: Env): ApnsConfig | null {
  const { APNS_KEY: key } = env as Env & { APNS_KEY?: string };
  const { APNS_KEY_ID: keyId, APNS_TEAM_ID: teamId, APNS_TOPIC: topic } = env;
  if (key && keyId && teamId && topic) return { key, keyId, teamId, topic };
  // Half a setup is a mistake worth seeing (a dashboard save can blank vars);
  // none at all is a deployment that simply doesn't use push.
  const missing = Object.entries({
    APNS_KEY: key,
    APNS_KEY_ID: keyId,
    APNS_TEAM_ID: teamId,
    APNS_TOPIC: topic
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length < 4) {
    console.warn(`APNs push is off: ${missing.join(", ")} not set`);
  }
  return null;
}
