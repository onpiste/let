const encoder = new TextEncoder();

async function hmac(algorithm: "SHA-1" | "SHA-256", key: string, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"]
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data))
  );
}

function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function base64Url(bytes: Uint8Array) {
  return base64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** Constant-time string comparison. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Checks X-Twilio-Signature on a form POST: HMAC-SHA1 of the full URL plus
 * every parameter name and value in name order, keyed by the auth token.
 */
export async function validTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
  signature: string
) {
  // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array; the Worker's lib has no toSorted
  const names = [...new Set(params.keys())].sort();
  let data = url;
  for (const name of names) {
    for (const value of params.getAll(name)) data += name + value;
  }
  return same(base64(await hmac("SHA-1", authToken, data)), signature);
}

/**
 * The media stream WebSocket carries no signature we can check before the
 * adapter takes it, so the answer webhook (which is signed) hands Twilio a
 * stream URL holding this token for its call, and only that URL is accepted.
 */
export async function streamToken(authToken: string, callSid: string) {
  return base64Url(await hmac("SHA-256", authToken, `stream:${callSid}`));
}

export async function validStreamToken(
  authToken: string,
  callSid: string,
  token: string
) {
  return same(await streamToken(authToken, callSid), token);
}
