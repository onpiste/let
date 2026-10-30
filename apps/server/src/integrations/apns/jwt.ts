import type { ApnsConfig } from "./config";

/**
 * Apple refuses a provider token older than an hour and one refreshed more
 * often than every 20 minutes, so each isolate reuses its token for 50.
 */
const TOKEN_LIFETIME_SECONDS = 50 * 60;

let cached: { keyId: string; issuedAt: number; token: string } | null = null;

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

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
  const encode = (value: object) =>
    base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: "ES256", kid: config.keyId })}.${encode({ iss: config.teamId, iat: now })}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(config.key),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  // WebCrypto returns the raw r‖s signature, which is what JWS expects.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const token = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  cached = { keyId: config.keyId, issuedAt: now, token };
  return token;
}
