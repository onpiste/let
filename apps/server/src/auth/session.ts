import type { User } from "@cot/shared";

import { buildCookie, getCookie } from "./cookies";

/**
 * The session is the user's profile plus an expiry, signed with
 * SESSION_SECRET (HMAC-SHA256) and kept in an HttpOnly cookie. Nothing is
 * stored server-side, so signing out only clears the cookie.
 */

const SESSION_COOKIE = "cot_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type Session = User & { exp: number };

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

async function createSessionValue(user: User, env: Env) {
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

/** The Durable Object name of a user's assistants; only the Worker picks it. */
export function agentName(user: User) {
  return `google:${user.id}`;
}

export function isAllowed(email: string, env: Env) {
  const allowed = (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/** A Set-Cookie value that stores a new session. */
export async function sessionCookie(request: Request, user: User, env: Env) {
  const value = await createSessionValue(user, env);
  return buildCookie(request, SESSION_COOKIE, value, SESSION_TTL_SECONDS);
}

/** A Set-Cookie value that clears the session. */
export function clearSessionCookie(request: Request) {
  return buildCookie(request, SESSION_COOKIE, "", 0);
}
