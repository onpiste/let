/**
 * The HTTP surface of the server that clients rely on. Every client (web,
 * browser extension, mobile) should build URLs from these constants rather
 * than hard-coding paths.
 */

export const AUTH_ROUTES = {
  login: "/auth/login",
  callback: "/auth/callback",
  logout: "/auth/logout",
  me: "/auth/me",
  /** Native apps exchange a sign-in code for a bearer token here. */
  token: "/auth/token"
} as const;

/**
 * Sign-in for native apps, which can't hold the browser's session cookie.
 *
 * 1. The app opens `AUTH_ROUTES.login` in a system web session with
 *    `redirect_uri` (the deployment's NATIVE_REDIRECT_URI) and a PKCE
 *    `code_challenge` (base64url SHA-256 of a random verifier).
 * 2. After Google sign-in the Worker redirects to `redirect_uri?code=…`.
 * 3. The app POSTs `NativeTokenRequest` to `AUTH_ROUTES.token` and gets a
 *    `NativeTokenResponse`; it sends the token as `Authorization: Bearer`
 *    on HTTP requests and on the agent WebSocket upgrade.
 */
export const NATIVE_AUTH_PARAMS = {
  redirectUri: "redirect_uri",
  codeChallenge: "code_challenge",
  code: "code"
} as const;

/**
 * The assistant a client talks to. `agent` is the Durable Object class name
 * and `basePath` the WebSocket/HTTP prefix the Worker routes to the
 * signed-in user's own instance. That socket carries the callables and
 * notices; each conversation is a `chat` sub-agent with a socket of its own
 * at `{basePath}/sub/{chatPath}/{chatId}` (see `chatSocketPath`).
 */
export const ASSISTANT = {
  agent: "Assistant",
  basePath: "chat",
  /** The class of one conversation, for `useAgent({ sub })`. */
  chat: "Chat",
  /** That class in the socket path (kebab-cased). */
  chatPath: "chat"
} as const;

/** The path, after `basePath`, of one conversation's socket. */
export function chatSocketPath(chatId: string) {
  return `sub/${ASSISTANT.chatPath}/${encodeURIComponent(chatId)}`;
}

/** Where MCP servers send the user back after OAuth; routed like `/chat`. */
export const MCP_CALLBACK_PATH = `${ASSISTANT.basePath}/mcp-callback`;
