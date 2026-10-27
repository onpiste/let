import { registerPlugin } from "@capacitor/core";

import {
  AUTH_ROUTES,
  NATIVE_AUTH_PARAMS,
  type NativeTokenRequest
} from "@cot/shared";

// Google refuses sign-in inside an embedded WebView, so the iOS app signs in
// through the system's web authentication sheet (the WebAuth plugin in
// apps/mobile/ios/App/App/WebAuthPlugin.swift) and trades the returned code
// at AUTH_ROUTES.token, which also sets the WebView's session cookie.

/** Must match NATIVE_REDIRECT_URI and the app's URL scheme (Info.plist). */
const REDIRECT_URI = "cot://auth/callback";

type WebAuthPlugin = {
  start(options: {
    url: string;
    callbackScheme: string;
  }): Promise<{ url: string }>;
};

const WebAuth = registerPlugin<WebAuthPlugin>("WebAuth");

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Resolves once the session cookie is set; rejects if cancelled or failed. */
export async function nativeSignIn() {
  const codeVerifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );

  const login = new URL(AUTH_ROUTES.login, location.origin);
  login.searchParams.set(NATIVE_AUTH_PARAMS.redirectUri, REDIRECT_URI);
  login.searchParams.set(
    NATIVE_AUTH_PARAMS.codeChallenge,
    base64Url(new Uint8Array(digest))
  );

  const { url } = await WebAuth.start({
    url: login.toString(),
    callbackScheme: new URL(REDIRECT_URI).protocol.replace(":", "")
  });
  const code = new URL(url).searchParams.get(NATIVE_AUTH_PARAMS.code);
  if (!code) throw new Error("Sign-in did not return a code.");

  const body: NativeTokenRequest = { code, codeVerifier };
  const res = await fetch(AUTH_ROUTES.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Sign-in failed (${res.status})`);
}
