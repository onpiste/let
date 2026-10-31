/** Base64url without padding, as JWTs and Web Push use it. */
export function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function fromBase64Url(text: string) {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64), (char) => char.codePointAt(0) ?? 0);
}

/** Signs a JWT with an ECDSA P-256 key (ES256), for APNs and VAPID. */
export async function signJwt(
  header: Record<string, string>,
  claims: Record<string, string | number>,
  key: CryptoKey
) {
  const encode = (value: object) =>
    base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: "ES256", ...header })}.${encode(claims)}`;
  // WebCrypto returns the raw r‖s signature, which is what JWS expects.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}
