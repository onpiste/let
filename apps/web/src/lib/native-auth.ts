import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor, registerPlugin } from "@capacitor/core";

import {
  AUTH_ROUTES,
  NATIVE_AUTH_PARAMS,
  type NativeTokenRequest
} from "@cot/shared";

// Google refuses sign-in inside an embedded WebView, so the apps sign in in
// the system browser and trade the returned code at AUTH_ROUTES.token, which
// also sets the WebView's session cookie. iOS uses its web authentication
// sheet (WebAuthPlugin.swift in apps/mobile/ios); Android a Custom Tab whose
// redirect to the app's URL scheme comes back as an appUrlOpen event.

/**
 * Must match NATIVE_REDIRECT_URI and the app's URL scheme (iOS Info.plist,
 * Android AndroidManifest.xml).
 */
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

// Android reports the Custom Tab closing as it hands the redirect to the app,
// sometimes before appUrlOpen; only a close with no redirect is a cancel.
const CANCEL_GRACE_MS = 1500;

function signInWithCustomTab(url: string) {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const listeners = [
      App.addListener("appUrlOpen", (event) => {
        if (event.url.startsWith(REDIRECT_URI)) {
          finish(() => resolve(event.url));
        }
      }),
      Browser.addListener("browserFinished", () => {
        setTimeout(
          () => finish(() => reject(new Error("Sign-in cancelled"))),
          CANCEL_GRACE_MS
        );
      })
    ];
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      for (const listener of listeners) {
        listener.then((l) => l.remove()).catch(() => {});
      }
      settle();
    };
    Browser.open({ url }).catch((error: unknown) =>
      finish(() => reject(new Error(String(error))))
    );
  });
}

async function openSignIn(url: string) {
  if (Capacitor.getPlatform() === "android") return signInWithCustomTab(url);
  const result = await WebAuth.start({
    url,
    callbackScheme: new URL(REDIRECT_URI).protocol.replace(":", "")
  });
  return result.url;
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

  const url = await openSignIn(login.toString());
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
