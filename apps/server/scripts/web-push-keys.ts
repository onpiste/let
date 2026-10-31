// Prints a new VAPID key pair for Web Push. Run from apps/server:
//   bun run web-push-keys
// Put the public key in WEB_PUSH_PUBLIC_KEY (wrangler.jsonc) and the private
// one in the WEB_PUSH_PRIVATE_KEY secret. A new pair re-subscribes every
// browser the next time it opens the app.
const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"]
);
const publicKey = new Uint8Array(
  await crypto.subtle.exportKey("raw", pair.publicKey)
);
const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
const publicBase64Url = Buffer.from(publicKey).toString("base64url");
process.stdout.write(
  `WEB_PUSH_PUBLIC_KEY=${publicBase64Url}\nWEB_PUSH_PRIVATE_KEY=${d ?? ""}\n`
);
