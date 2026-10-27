import type { User } from "@cot/shared";

import { buildCookie, getCookie } from "./cookies";
import { sign, verify } from "./signing";

/**
 * The session is the user's profile plus an expiry, signed with
 * SESSION_SECRET (HMAC-SHA256). Browsers keep it in an HttpOnly cookie;
 * native apps send the same value as `Authorization: Bearer`. Nothing is
 * stored server-side, so signing out only forgets the value.
 */

const SESSION_COOKIE = "cot_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type Session = User & { exp: number };

/** A signed session value and when it expires (unix seconds). */
export async function createSession(user: User, env: Env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const session: Session = { ...user, exp };
  return { value: await sign(session, env), exp };
}

async function readSessionValue(value: string, env: Env): Promise<User | null> {
  const session = await verify<Session>(value, env);
  if (!session) return null;
  return {
    id: session.id,
    email: session.email,
    name: session.name,
    picture: session.picture
  };
}

function bearerToken(request: Request) {
  const header = request.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export async function getUserFromRequest(request: Request, env: Env) {
  const value = bearerToken(request) ?? getCookie(request, SESSION_COOKIE);
  const user = value ? await readSessionValue(value, env) : null;
  // Re-check so removing an email from ALLOWED_EMAILS takes effect at once.
  return user && isAllowed(user.email, env) ? user : null;
}

export function isAllowed(email: string, env: Env) {
  const allowed = (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/** A Set-Cookie value that stores a session from `createSession`. */
export function sessionCookie(request: Request, value: string) {
  return buildCookie(request, SESSION_COOKIE, value, SESSION_TTL_SECONDS);
}

/** A Set-Cookie value that clears the session. */
export function clearSessionCookie(request: Request) {
  return buildCookie(request, SESSION_COOKIE, "", 0);
}
