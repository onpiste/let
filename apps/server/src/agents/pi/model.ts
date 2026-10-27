import type { Model } from "@mariozechner/pi-ai";

export const MODEL_ID = "@cf/moonshotai/kimi-k2.7-code";

/**
 * Kimi on Workers AI through its OpenAI-compatible REST endpoint. The Pi
 * harness can't use the AI binding, hence the account id and API token.
 */
export function workersAiModel(env: Env): Model<"openai-completions"> {
  return {
    id: MODEL_ID,
    name: "Kimi K2.7 Code",
    api: "openai-completions",
    provider: "cloudflare-workers-ai",
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
    compat: { sendSessionAffinityHeaders: true },
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256_000,
    maxTokens: 32_000
  };
}
