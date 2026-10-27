/**
 * Google OAuth endpoints shared by sign-in (auth/google.ts) and service
 * grants (connect.ts). Both use the one redirect URI, /auth/callback, so a
 * fork registers nothing new to turn on Gmail or Calendar.
 */

import type { GoogleService } from "@cot/shared";

import { buildCookie, getCookie } from "../../auth/cookies";
import { noStore } from "../../http/responses";

export const STATE_COOKIE = "cot_oauth_state";

/** What the callback should do, kept in the state cookie across the redirect. */
type OAuthIntent = {
  state: string;
  connect?: { service: GoogleService; returnTo: string };
};

/**
 * Redirects to Google's consent screen. Sign-in asks for the profile only;
 * a service grant (connect.ts) adds its scopes to the existing grant.
 */
export function redirectToGoogle(
  request: Request,
  env: Env,
  options: {
    scope: string;
    params?: Record<string, string>;
    connect?: OAuthIntent["connect"];
  }
) {
  const { clientId } = getGoogleConfig(env);
  const intent: OAuthIntent = {
    state: crypto.randomUUID(),
    connect: options.connect
  };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getRedirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", options.scope);
  url.searchParams.set("state", intent.state);
  for (const [key, value] of Object.entries(options.params ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers = noStore({ Location: url.toString() });
  headers.append(
    "Set-Cookie",
    buildCookie(request, STATE_COOKIE, JSON.stringify(intent), 600)
  );
  return new Response(null, { status: 302, headers });
}

export function readIntent(request: Request): OAuthIntent | null {
  const value = getCookie(request, STATE_COOKIE);
  if (!value) return null;
  try {
    // Our own cookie, written by redirectToGoogle above.
    return JSON.parse(value) as OAuthIntent;
  } catch {
    return null;
  }
}

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
};

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

async function tokenRequest(env: Env, params: Record<string, string>) {
  const { clientId, clientSecret } = getGoogleConfig(env);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  // Google's token endpoint returns JSON for both success and errors.
  const payload = (await response.json()) as Partial<TokenResponse> & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ??
        payload.error ??
        "Google token request failed"
    );
  }
  return {
    access_token: payload.access_token,
    expires_in: payload.expires_in ?? 3600,
    scope: payload.scope ?? "",
    refresh_token: payload.refresh_token
  } satisfies TokenResponse;
}

export function exchangeCode(request: Request, env: Env, code: string) {
  return tokenRequest(env, {
    code,
    redirect_uri: getRedirectUri(request),
    grant_type: "authorization_code"
  });
}

export function refreshAccessToken(env: Env, refreshToken: string) {
  return tokenRequest(env, {
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
}

/** Revokes the whole grant; Google can't take back a single scope. */
export async function revokeToken(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token })
  });
}
