import { signJwt } from "../jwt";
import type { ApnsConfig } from "./config";

/**
 * Apple refuses a provider token older than an hour and one refreshed more
 * often than every 20 minutes, so each isolate reuses its token for 50.
 */
const TOKEN_LIFETIME_SECONDS = 50 * 60;

let cached: { keyId: string; issuedAt: number; token: string } | null = null;

/** The PKCS#8 bytes of a .p8 file, tolerating lost line breaks or headers. */
function pemToDer(pem: string) {
  const body = pem
    .replaceAll(String.raw`\n`, "")
    .replaceAll(/-----[A-Z ]+-----/g, "")
    .replaceAll(/\s/g, "");
  return Uint8Array.from(atob(body), (char) => char.codePointAt(0) ?? 0);
}

/** An ES256 JWT that authenticates the Worker to APNs. */
export async function providerToken(config: ApnsConfig) {
  const now = Math.floor(Date.now() / 1000);
  if (
    cached?.keyId === config.keyId &&
    now - cached.issuedAt < TOKEN_LIFETIME_SECONDS
  ) {
    return cached.token;
  }
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(config.key),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const token = await signJwt(
    { kid: config.keyId },
    { iss: config.teamId, iat: now },
    key
  );
  cached = { keyId: config.keyId, issuedAt: now, token };
  return token;
}
