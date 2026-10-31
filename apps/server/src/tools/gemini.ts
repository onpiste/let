/**
 * A bare-bones client for the Gemini REST API. Plain fetch rather than an
 * SDK: the two calls Cot makes (grounded search, Deep Research) don't justify
 * another dependency, and the Worker stays small.
 *
 * Requests go straight to Google, or through Cloudflare AI Gateway when the
 * deployment sets AI_GATEWAY_ID: then they show up in the gateway's logs and
 * analytics, and the gateway can hold the deployment's Google key itself.
 */
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";

/** Optional secrets; `wrangler types` only lists required ones. */
type GeminiSecrets = {
  /** The deployment's own Gemini key, paid by the deployer. */
  GEMINI_API_KEY?: string;
  /** Token for an authenticated AI Gateway (`cf-aig-authorization`). */
  CF_AIG_TOKEN?: string;
};

/** Who a request is billed to, and the key it carries, if any. */
export type GeminiKey = {
  /** Absent when an authenticated gateway supplies its stored key. */
  apiKey: string | undefined;
  /** The user's own key: free to the deployment, so not limited. */
  ownKey: boolean;
};

/**
 * The key to call Gemini with: the user's own if they saved one, else the
 * deployment's (a GEMINI_API_KEY secret, or a key stored in the AI Gateway).
 * Null when neither exists, and the Gemini tools are left out.
 */
export function geminiKey(env: Env, userKey: string | undefined) {
  if (userKey) return { apiKey: userKey, ownKey: true } satisfies GeminiKey;
  const { GEMINI_API_KEY, CF_AIG_TOKEN } = env as Env & GeminiSecrets;
  if (GEMINI_API_KEY || (env.AI_GATEWAY_ID && CF_AIG_TOKEN)) {
    return { apiKey: GEMINI_API_KEY, ownKey: false } satisfies GeminiKey;
  }
  return null;
}

async function baseUrl(env: Env) {
  if (!env.AI_GATEWAY_ID) return GEMINI_API;
  const gateway = await env.AI.gateway(env.AI_GATEWAY_ID).getUrl(
    "google-ai-studio"
  );
  return `${gateway.replace(/\/$/, "")}/v1beta`;
}

export async function gemini<T>(
  env: Env,
  key: GeminiKey,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (key.apiKey) headers["x-goog-api-key"] = key.apiKey;
  if (env.AI_GATEWAY_ID) {
    const { CF_AIG_TOKEN } = env as Env & GeminiSecrets;
    if (CF_AIG_TOKEN)
      headers["cf-aig-authorization"] = `Bearer ${CF_AIG_TOKEN}`;
    // Search must be fresh, and a cached poll would never see a run finish.
    headers["cf-aig-skip-cache"] = "true";
  }
  const response = await fetch(`${await baseUrl(env)}/${path}`, {
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
