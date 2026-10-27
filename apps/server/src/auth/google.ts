/**
 * Google sign-in.
 *
 * /auth/login redirects to Google, /auth/callback exchanges the code for the
 * user's profile and sets the session cookie (see session.ts). The Google
 * token itself never reaches the browser.
 */

import { noStore } from "../http/responses";
import { buildCookie, getCookie } from "./cookies";
import { clearSessionCookie, isAllowed, sessionCookie } from "./session";

const STATE_COOKIE = "cot_oauth_state";
const GOOGLE_SCOPE = "openid email profile";

function getGoogleConfig(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET
  };
}

function getRedirectUri(request: Request) {
  return `${new URL(request.url).origin}/auth/callback`;
}

export function handleLogin(request: Request, env: Env) {
  const { clientId } = getGoogleConfig(env);
  const state = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getRedirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const headers = noStore({ Location: url.toString() });
  headers.append("Set-Cookie", buildCookie(request, STATE_COOKIE, state, 600));
  return new Response(null, { status: 302, headers });
}

async function exchangeCode(request: Request, env: Env, code: string) {
  const { clientId, clientSecret } = getGoogleConfig(env);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(request),
      grant_type: "authorization_code"
    })
  });
  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Google token exchange failed"
    );
  }
  return payload.access_token;
}

async function fetchGoogleUser(accessToken: string) {
  const response = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    throw new Error(`Google user lookup failed (${response.status})`);
  }
  return (await response.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
}

export async function handleCallback(request: Request, env: Env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const headers = noStore();
  headers.append("Set-Cookie", buildCookie(request, STATE_COOKIE, "", 0));

  if (oauthError) {
    return new Response(`Google sign-in failed: ${oauthError}`, {
      status: 400,
      headers
    });
  }
  if (!code || !state || state !== getCookie(request, STATE_COOKIE)) {
    return new Response("Invalid sign-in callback", { status: 400, headers });
  }

  const profile = await fetchGoogleUser(await exchangeCode(request, env, code));
  if (!profile.email || !profile.email_verified) {
    return new Response("Your Google account has no verified email.", {
      status: 403,
      headers
    });
  }
  if (!isAllowed(profile.email, env)) {
    return new Response(
      `${profile.email} is not allowed to use this assistant. Add it to ALLOWED_EMAILS.`,
      { status: 403, headers }
    );
  }

  const cookie = await sessionCookie(
    request,
    {
      id: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email,
      picture: profile.picture ?? null
    },
    env
  );
  headers.set("Location", "/");
  headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export function handleLogout(request: Request) {
  const headers = noStore();
  headers.append("Set-Cookie", clearSessionCookie(request));
  return new Response(null, { status: 204, headers });
}
