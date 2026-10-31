/**
 * Sign-in for native apps (see NATIVE_AUTH_PARAMS in @cot/shared).
 *
 * The Google flow is the web one; only its ends differ. /auth/login remembers
 * the app's redirect URI and PKCE challenge in a short-lived cookie, the
 * callback hands the app a signed one-time code instead of a session cookie,
 * and /auth/token trades that code plus the PKCE verifier for a bearer token.
 * Without the verifier, which never leaves the app, an intercepted code is
 * useless.
 *
 * The response also sets the session cookie, so a WebView shell (apps/mobile)
 * that made the call is signed in like a browser.
 */

import {
  NATIVE_AUTH_PARAMS,
  type NativeTokenRequest,
  type NativeTokenResponse,
  type User
} from "@cot/shared";

import { jsonResponse } from "../http/responses";
import { buildCookie, getCookie } from "./cookies";
import { createSession, isAllowed, sessionCookie } from "./session";
import { sha256Base64Url, sign, verify } from "./signing";

const NATIVE_COOKIE = "cot_oauth_native";
const CODE_PURPOSE = "native-code";
const CODE_TTL_SECONDS = 120;
// RFC 7636: a base64url SHA-256 digest is 43 characters.
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

type NativeLogin = { redirectUri: string; challenge: string };
type NativeCode = { user: User; challenge: string; exp: number };

// RFC 8252 §7.3: desktop apps listen on a random loopback port, so only the
// host and path are fixed. The PKCE verifier still protects the code.
const LOOPBACK_REDIRECT = /^http:\/\/127\.0\.0\.1:[0-9]{2,5}\/callback$/;

function allowedRedirect(redirectUri: string, env: Env) {
  const configured = env.NATIVE_REDIRECT_URI.trim();
  // An empty NATIVE_REDIRECT_URI turns native sign-in off for desktop too.
  if (configured === "") return false;
  return redirectUri === configured || LOOPBACK_REDIRECT.test(redirectUri);
}

/**
 * The native app's parameters if /auth/login was opened by one, or null for
 * a browser sign-in. Throws when they are present but not acceptable.
 */
export function readNativeLogin(url: URL, env: Env): NativeLogin | null {
  const redirectUri = url.searchParams.get(NATIVE_AUTH_PARAMS.redirectUri);
  if (redirectUri === null) return null;
  const challenge = url.searchParams.get(NATIVE_AUTH_PARAMS.codeChallenge);
  if (!allowedRedirect(redirectUri, env)) {
    throw new Error(
      "This redirect_uri is not allowed. Set NATIVE_REDIRECT_URI."
    );
  }
  if (!challenge || !CHALLENGE.test(challenge)) {
    throw new Error("A base64url SHA-256 code_challenge is required.");
  }
  return { redirectUri, challenge };
}

export function nativeLoginCookie(request: Request, login: NativeLogin) {
  return buildCookie(request, NATIVE_COOKIE, JSON.stringify(login), 600);
}

export function clearNativeLoginCookie(request: Request) {
  return buildCookie(request, NATIVE_COOKIE, "", 0);
}

/** The pending native sign-in for this callback, if the login started one. */
export function pendingNativeLogin(
  request: Request,
  env: Env
): NativeLogin | null {
  const raw = getCookie(request, NATIVE_COOKIE);
  if (!raw) return null;
  try {
    // Trust boundary: the cookie came back from the browser, so re-check it.
    const login = JSON.parse(raw) as Partial<NativeLogin>;
    if (
      typeof login.redirectUri === "string" &&
      typeof login.challenge === "string" &&
      allowedRedirect(login.redirectUri, env) &&
      CHALLENGE.test(login.challenge)
    ) {
      return { redirectUri: login.redirectUri, challenge: login.challenge };
    }
  } catch {
    // Malformed cookie — treat it as a browser sign-in.
  }
  return null;
}

/** Where to send the app after Google sign-in: its URL plus a one-time code. */
export async function nativeRedirect(login: NativeLogin, user: User, env: Env) {
  const payload: NativeCode = {
    user,
    challenge: login.challenge,
    exp: Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS
  };
  const url = new URL(login.redirectUri);
  url.searchParams.set(
    NATIVE_AUTH_PARAMS.code,
    await sign(payload, env, CODE_PURPOSE)
  );
  return url.toString();
}

/** POST /auth/token: code + PKCE verifier → bearer token. */
export async function handleToken(request: Request, env: Env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let body: Partial<NativeTokenRequest>;
  try {
    // Trust boundary: the shape is checked field by field below.
    body = (await request.json()) as Partial<NativeTokenRequest>;
  } catch {
    return jsonResponse({ error: "Expected a JSON body" }, { status: 400 });
  }
  if (typeof body.code !== "string" || typeof body.codeVerifier !== "string") {
    return jsonResponse(
      { error: "code and codeVerifier are required" },
      { status: 400 }
    );
  }

  const code = await verify<NativeCode>(body.code, env, CODE_PURPOSE);
  if (!code || code.challenge !== (await sha256Base64Url(body.codeVerifier))) {
    return jsonResponse({ error: "Invalid or expired code" }, { status: 400 });
  }
  if (!isAllowed(code.user.email, env)) {
    return jsonResponse({ error: "Not allowed" }, { status: 403 });
  }

  const session = await createSession(code.user, env);
  const headers = new Headers({
    "Set-Cookie": sessionCookie(request, session.value)
  });
  const response: NativeTokenResponse = {
    token: session.value,
    expiresAt: session.exp,
    user: code.user
  };
  return jsonResponse(response, { headers });
}
