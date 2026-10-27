/**
 * HMAC-SHA256 signed values (`<payload>.<signature>`, both base64url) keyed
 * by SESSION_SECRET. The session cookie, native bearer tokens and one-time
 * native sign-in codes all use this; `purpose` keeps one kind from being
 * accepted as another.
 */

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function getSecret(env: Env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return env.SESSION_SECRET;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// Sessions sign the bare payload so cookies issued before purposes existed
// stay valid; every other purpose is prefixed onto the signed bytes.
function signedBytes(payload: string, purpose: string) {
  return encoder.encode(purpose ? `${purpose}.${payload}` : payload);
}

export async function sign(value: unknown, env: Env, purpose = "") {
  const payload = toBase64Url(encoder.encode(JSON.stringify(value)));
  const key = await hmacKey(getSecret(env));
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    signedBytes(payload, purpose)
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The signed object if the signature matches and `exp` is in the future. */
export async function verify<T extends { exp: number }>(
  value: string,
  env: Env,
  purpose = ""
): Promise<T | null> {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  try {
    const key = await hmacKey(getSecret(env));
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      signedBytes(payload, purpose)
    );
    if (!valid) return null;
    // Trust boundary: we signed this payload, so it has the shape we wrote.
    const data = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payload))
    ) as T;
    return data.exp < Date.now() / 1000 ? null : data;
  } catch {
    return null;
  }
}

export async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
}
