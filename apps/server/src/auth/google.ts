/**
 * Google sign-in.
 *
 * /auth/login redirects to Google, /auth/callback exchanges the code for the
 * user's profile and sets the session cookie (see session.ts). The Google
 * token itself never reaches the browser. The same callback finishes grants
 * of Gmail or Calendar (integrations/google/connect.ts).
 */

import { noStore } from "../http/responses";
import { finishGoogleConnect } from "../integrations/google/connect";
import {
  exchangeCode,
  readIntent,
  redirectToGoogle,
  STATE_COOKIE
} from "../integrations/google/oauth";
import { buildCookie } from "./cookies";
import { clearSessionCookie, isAllowed, sessionCookie } from "./session";

const GOOGLE_SCOPE = "openid email profile";

export function handleLogin(request: Request, env: Env) {
  return redirectToGoogle(request, env, {
    scope: GOOGLE_SCOPE,
    params: { prompt: "select_account" }
  });
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
  const intent = readIntent(request);
  if (!code || !state || state !== intent?.state) {
    return new Response("Invalid sign-in callback", { status: 400, headers });
  }

  const tokens = await exchangeCode(request, env, code);
  const profile = await fetchGoogleUser(tokens.access_token);
  if (intent.connect) {
    return finishGoogleConnect(request, env, {
      headers,
      profileId: profile.sub,
      tokens,
      returnTo: intent.connect.returnTo
    });
  }
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
