import { base64Url, fromBase64Url, signJwt } from "../jwt";
import type { WebPushConfig } from "./config";

/** Push services accept a VAPID token for up to 24 hours. */
const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

/** Tokens are per push service (the JWT's audience); reused per isolate. */
const cached = new Map<string, { expires: number; header: string }>();

async function signingKey(config: WebPushConfig) {
  const point = fromBase64Url(config.publicKey);
  const coordinate = (start: number) =>
    base64Url(point.slice(start, start + 32));
  // An uncompressed point is 0x04 ‖ x ‖ y; JWK wants them apart.
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: config.privateKey,
      x: coordinate(1),
      y: coordinate(33)
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

/** The `Authorization` header (RFC 8292) for a push to `endpoint`. */
export async function vapidAuthorization(
  config: WebPushConfig,
  endpoint: string
) {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const hit = cached.get(audience);
  // Renew an hour early so a token never expires in flight.
  if (hit && hit.expires - now > 60 * 60) return hit.header;
  const expires = now + TOKEN_LIFETIME_SECONDS;
  const token = await signJwt(
    { typ: "JWT" },
    { aud: audience, exp: expires, sub: config.subject },
    await signingKey(config)
  );
  const header = `vapid t=${token}, k=${config.publicKey}`;
  cached.set(audience, { expires, header });
  return header;
}
