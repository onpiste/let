import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";

import type { Settings } from "@cot/shared";

/**
 * The model for the user's chosen provider. A plain string is a Workers AI
 * model id, which Think runs through the AI binding.
 */
export function modelFor({
  provider,
  model,
  apiKeys
}: Settings): string | LanguageModel {
  switch (provider) {
    case "workers-ai":
      return model;
    case "openai":
      return createOpenAI({ apiKey: apiKeys.openai })(model);
    case "anthropic":
      return createAnthropic({ apiKey: apiKeys.anthropic })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: apiKeys.google })(model);
  }
}

/** Whether turns run on the user's own API key rather than the deployment's. */
export function paidByUser({ provider, apiKeys }: Settings) {
  return provider !== "workers-ai" && Boolean(apiKeys[provider]);
}

/** Like modelFor, but a model object even for Workers AI, for direct calls. */
export function languageModelFor(settings: Settings, env: Env): LanguageModel {
  const model = modelFor(settings);
  return typeof model === "string"
    ? createWorkersAI({ binding: env.AI })(model)
    : model;
}
