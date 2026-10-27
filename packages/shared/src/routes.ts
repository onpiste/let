/**
 * The HTTP surface of the server that clients rely on. Every client (web,
 * browser extension, mobile) should build URLs from these constants rather
 * than hard-coding paths.
 */

export const AUTH_ROUTES = {
  login: "/auth/login",
  callback: "/auth/callback",
  logout: "/auth/logout",
  me: "/auth/me"
} as const;

/**
 * The agent harnesses a client can talk to. `agent` is the Durable Object
 * class name and `basePath` the WebSocket/HTTP prefix the Worker routes to
 * the signed-in user's own instance.
 */
export const HARNESSES = {
  think: { agent: "Assistant", basePath: "chat", label: "Think" },
  pi: { agent: "PiAssistant", basePath: "pi", label: "Pi" }
} as const;

export type HarnessId = keyof typeof HARNESSES;
export type HarnessBasePath = (typeof HARNESSES)[HarnessId]["basePath"];

/** Where MCP servers send the user back after OAuth; routed like `/chat`. */
export const MCP_CALLBACK_PATH = `${HARNESSES.think.basePath}/mcp-callback`;
