import { AUTH_ROUTES, type User } from "@cot/shared";

// The Worker routes /chat and /pi to the signed-in user's own assistant
// instance, so the session cookie is the only identity the client holds.

export async function fetchCurrentUser(): Promise<User | null> {
  const res = await fetch(AUTH_ROUTES.me, {
    headers: { Accept: "application/json" }
  });
  if (res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`Failed to load the current user (${res.status})`);
  }
  return (await res.json()) as User;
}

export async function signOut() {
  await fetch(AUTH_ROUTES.logout, { method: "POST" }).catch(() => {});
}
