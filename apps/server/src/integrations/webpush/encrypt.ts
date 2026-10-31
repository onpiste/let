import type { WebPushSubscription } from "@cot/shared";

import { fromBase64Url } from "../jwt";

/** One record holds the whole message; push services cap bodies at 4 KB. */
const RECORD_SIZE = 4096;

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const text = (value: string) => new TextEncoder().encode(value);

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bytes: number
) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    bytes * 8
  );
  return new Uint8Array(bits);
}

/**
 * Encrypts a push message for one browser (RFC 8291, `aes128gcm`): only the
 * browser holding the subscription's private key can read it, so the push
 * service relaying it can't.
 */
export async function encryptPayload(
  subscription: WebPushSubscription,
  payload: string
) {
  const browserKey = fromBase64Url(subscription.keys.p256dh);
  const authSecret = fromBase64Url(subscription.keys.auth);

  // A fresh key pair per message; its public half travels in the header.
  const local = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  )) as CryptoKeyPair; // generateKey's union type; ECDH always returns a pair
  const localPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer
  );
  const browserPublic = await crypto.subtle.importKey(
    "raw",
    browserKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      // workerd's types spell the reserved word `$public`; the runtime, like
      // WebCrypto everywhere, reads `public`.
      { name: "ECDH", public: browserPublic } as SubtleCryptoDeriveKeyAlgorithm,
      local.privateKey,
      256
    )
  );

  const ikm = await hkdf(
    authSecret,
    shared,
    concat(text("WebPush: info\0"), browserKey, localPublic),
    32
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, text("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, text("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, [
    "encrypt"
  ]);
  // 0x02 marks the last (here, only) record; no padding.
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    concat(text(payload), new Uint8Array([2]))
  );

  // Header: salt ‖ record size ‖ key length ‖ our public key.
  const header = new Uint8Array(16 + 4 + 1 + localPublic.length);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = localPublic.length;
  header.set(localPublic, 21);
  return concat(header, new Uint8Array(ciphertext));
}
