/**
 * Google sign-in.
 *
 * /auth/login redirects to Google, /auth/callback exchanges the code for the
 * user's profile and sets a session cookie signed with SESSION_SECRET. The
 * Google token itself never reaches the browser.
 */

const STATE_COOKIE = "cot_oauth_state";
const SESSION_COOKIE = "cot_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const GOOGLE_SCOPE = "openid email profile";

export type User = {
  /** Google's stable account id (`sub`). */
  id: string;
  email: string;
  name: string;
  picture: string | null;
};

type Session = User & { exp: number };

// ── Cookies ───────────────────────────────────────────────────────────

function isSecure(request: Request) {
  return new URL(request.url).protocol === "https:";
}

function buildCookie(
  request: Request,
  name: string,
  value: string,
  maxAge: number
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
    `Max-Age=${maxAge}`
  ];
  if (isSecure(request)) parts.push("Secure");
  return parts.join("; ");
}

function getCookie(request: Request, name: string) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const cookie of header.split(";")) {
    const [rawName, ...rest] = cookie.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function noStore(init?: HeadersInit) {
  const headers = new Headers(init);
  headers.set("Cache-Control", "no-store");
  return headers;
}

// ── Signed session ────────────────────────────────────────────────────

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

export async function createSessionValue(user: User, env: Env) {
  const session: Session = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  };
  const payload = toBase64Url(encoder.encode(JSON.stringify(session)));
  const key = await hmacKey(getSecret(env));
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

async function readSessionValue(value: string, env: Env): Promise<User | null> {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  try {
    const key = await hmacKey(getSecret(env));
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      encoder.encode(payload)
    );
    if (!valid) return null;
    const session = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payload))
    ) as Session;
    if (session.exp < Date.now() / 1000) return null;
    return {
      id: session.id,
      email: session.email,
      name: session.name,
      picture: session.picture
    };
  } catch {
    return null;
  }
}

export async function getUserFromRequest(request: Request, env: Env) {
  const value = getCookie(request, SESSION_COOKIE);
  const user = value ? await readSessionValue(value, env) : null;
  // Re-check so removing an email from ALLOWED_EMAILS takes effect at once.
  return user && isAllowed(user.email, env) ? user : null;
}

// ── Google OAuth ──────────────────────────────────────────────────────

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

export function isAllowed(email: string, env: Env) {
  const allowed = (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
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

  const session = await createSessionValue(
    {
      id: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email,
      picture: profile.picture ?? null
    },
    env
  );
  headers.set("Location", "/");
  headers.append(
    "Set-Cookie",
    buildCookie(request, SESSION_COOKIE, session, SESSION_TTL_SECONDS)
  );
  return new Response(null, { status: 302, headers });
}

export function handleLogout(request: Request) {
  const headers = noStore();
  headers.append("Set-Cookie", buildCookie(request, SESSION_COOKIE, "", 0));
  return new Response(null, { status: 204, headers });
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: noStore(init?.headers) });
}
