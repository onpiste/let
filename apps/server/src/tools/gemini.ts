/**
 * A bare-bones client for the Gemini REST API. Plain fetch rather than an
 * SDK: the two calls Cot makes (grounded search, Deep Research) don't justify
 * another dependency, and the Worker stays small.
 *
 * Every request goes through the Cloudflare AI Gateway named by
 * AI_GATEWAY_ID, never straight to Google: the gateway holds the deployment's
 * Google key and gives one place for logs, cost analytics and rate limits.
 */

/** Optional secret; `wrangler types` only lists required ones. */
type GatewaySecrets = {
  /** Token for the authenticated gateway (`cf-aig-authorization`). */
  CF_AIG_TOKEN?: string;
};

/** Who a request is billed to, and the key it carries, if any. */
export type GeminiKey = {
  /** The user's own key; absent when the gateway supplies its stored key. */
  apiKey: string | undefined;
  /** The user's own key: free to the deployment, so not limited. */
  ownKey: boolean;
};

/**
 * The key to call Gemini with: the user's own if they saved one, else the
 * deployment's, stored in the gateway (reached with CF_AIG_TOKEN). Null
 * without a gateway or any key, and the Gemini tools are left out.
 */
export function geminiKey(env: Env, userKey: string | undefined) {
  if (!env.AI_GATEWAY_ID) return null;
  if (userKey) return { apiKey: userKey, ownKey: true } satisfies GeminiKey;
  const { CF_AIG_TOKEN } = env as Env & GatewaySecrets;
  return CF_AIG_TOKEN
    ? ({ apiKey: undefined, ownKey: false } satisfies GeminiKey)
    : null;
}

export async function gemini<T>(
  env: Env,
  key: GeminiKey,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    // Search must be fresh, and a cached poll would never see a run finish.
    "cf-aig-skip-cache": "true"
  };
  const { CF_AIG_TOKEN } = env as Env & GatewaySecrets;
  if (CF_AIG_TOKEN) headers["cf-aig-authorization"] = `Bearer ${CF_AIG_TOKEN}`;
  if (key.apiKey) headers["x-goog-api-key"] = key.apiKey;
  const gateway = await env.AI.gateway(env.AI_GATEWAY_ID).getUrl(
    "google-ai-studio"
  );
  const response = await fetch(`${gateway.replace(/\/$/, "")}/v1beta/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Gemini API ${response.status}: ${detail}`);
  }
  // Trust boundary: the shape is Google's documented response for `path`.
  return (await response.json()) as T;
}
