// Cookies are HttpOnly and SameSite=Lax; Secure whenever the request is https.

function isSecure(request: Request) {
  return new URL(request.url).protocol === "https:";
}

export function buildCookie(
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

export function getCookie(request: Request, name: string) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const cookie of header.split(";")) {
    const [rawName, ...rest] = cookie.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
