/**
 * Per-user settings, stored in the user's Think assistant and edited from the
 * settings page. Every client imports this module, so it must stay pure: no
 * runtime-specific APIs and no server-only dependencies.
 */

export type ProviderId = "workers-ai" | "openai" | "anthropic" | "google";
export type KeyedProvider = Exclude<ProviderId, "workers-ai">;

export const PROVIDERS: Record<
  ProviderId,
  { label: string; defaultModel: string; suggestions: string[] }
> = {
  "workers-ai": {
    label: "Workers AI",
    defaultModel: "@cf/moonshotai/kimi-k2.7-code",
    suggestions: ["@cf/moonshotai/kimi-k2.7-code"]
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5.5",
    suggestions: ["gpt-5.5"]
  },
  anthropic: {
    label: "Anthropic",
    defaultModel: "claude-sonnet-5-5",
    suggestions: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]
  },
  google: {
    label: "Google",
    defaultModel: "",
    suggestions: []
  }
};

export type Settings = {
  assistantName: string;
  /** Extra instructions appended to the persona. */
  instructions: string;
  /** "auto" mirrors the user's language; otherwise a language name. */
  language: string;
  provider: ProviderId;
  model: string;
  apiKeys: Partial<Record<KeyedProvider, string>>;
};

/** What the settings page sees: API keys are never sent back in full. */
export type PublicSettings = Omit<Settings, "apiKeys"> & {
  apiKeys: Partial<Record<KeyedProvider, { last4: string }>>;
};

/**
 * A settings change from the page. For an API key, a string sets it, null
 * removes it and a missing entry leaves it unchanged.
 */
export type SettingsPatch = Partial<Omit<Settings, "apiKeys">> & {
  apiKeys?: Partial<Record<KeyedProvider, string | null>>;
};

export const DEFAULT_SETTINGS: Settings = {
  assistantName: "Cot",
  instructions: "",
  language: "auto",
  provider: "workers-ai",
  model: PROVIDERS["workers-ai"].defaultModel,
  apiKeys: {}
};

export function toPublicSettings(settings: Settings): PublicSettings {
  const apiKeys: PublicSettings["apiKeys"] = {};
  for (const [provider, key] of Object.entries(settings.apiKeys)) {
    if (key) apiKeys[provider as KeyedProvider] = { last4: key.slice(-4) };
  }
  return { ...settings, apiKeys };
}

const LIMITS = { assistantName: 40, instructions: 4000, language: 40 };

/** Applies a patch, rejecting values the assistant could not run with. */
export function applySettingsPatch(
  current: Settings,
  patch: SettingsPatch
): Settings {
  const next: Settings = {
    ...current,
    ...patch,
    apiKeys: { ...current.apiKeys }
  };
  for (const [provider, key] of Object.entries(patch.apiKeys ?? {})) {
    if (!(provider in PROVIDERS) || provider === "workers-ai") continue;
    if (key === null || key === "") {
      delete next.apiKeys[provider as KeyedProvider];
    } else if (typeof key === "string") {
      next.apiKeys[provider as KeyedProvider] = key.trim();
    }
  }

  next.assistantName =
    next.assistantName.trim() || DEFAULT_SETTINGS.assistantName;
  next.language = next.language.trim() || "auto";
  next.model = next.model.trim();
  for (const [field, max] of Object.entries(LIMITS)) {
    if (next[field as keyof typeof LIMITS].length > max) {
      throw new Error(`${field} is too long (max ${max} characters).`);
    }
  }
  if (!(next.provider in PROVIDERS)) {
    throw new Error(`Unknown provider: ${next.provider}`);
  }
  if (!next.model) throw new Error("Choose a model.");
  if (next.provider !== "workers-ai" && !next.apiKeys[next.provider]) {
    throw new Error(
      `Add an API key for ${PROVIDERS[next.provider].label} before selecting it.`
    );
  }
  return next;
}
