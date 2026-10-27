/** Headers that keep auth and API responses out of every cache. */
export function noStore(init?: HeadersInit) {
  const headers = new Headers(init);
  headers.set("Cache-Control", "no-store");
  return headers;
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: noStore(init?.headers) });
}
