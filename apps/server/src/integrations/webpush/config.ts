/** A VAPID key pair: how the Worker identifies itself to browser push services. */
export type WebPushConfig = {
  /** Uncompressed P-256 point, base64url; what browsers subscribe with. */
  publicKey: string;
  /** The private scalar `d`, base64url. */
  privateKey: string;
  /** A mailto: or https: contact the push services can reach. */
  subject: string;
};

/**
 * The deployment's VAPID keys, or null when Web Push isn't set up.
 * WEB_PUSH_PRIVATE_KEY is an optional secret, so `wrangler types` (which
 * only lists required ones) doesn't know it; it is read through a widened
 * type here.
 */
export function webPushConfig(env: Env): WebPushConfig | null {
  const { WEB_PUSH_PRIVATE_KEY: privateKey } = env as Env & {
    WEB_PUSH_PRIVATE_KEY?: string;
  };
  const { WEB_PUSH_PUBLIC_KEY: publicKey, WEB_PUSH_SUBJECT: subject } = env;
  if (publicKey && privateKey && subject) {
    return { publicKey, privateKey, subject };
  }
  // Half a setup is a mistake worth seeing; none at all is a deployment
  // that simply doesn't use Web Push.
  if (publicKey || privateKey) {
    console.warn(
      "Web Push is off: set WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT and the WEB_PUSH_PRIVATE_KEY secret"
    );
  }
  return null;
}
