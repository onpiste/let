import { useEffect, useState, type FormEvent } from "react";

import {
  PROVIDERS,
  type KeyedProvider,
  type ProviderId,
  type PublicSettings,
  type SettingsPatch
} from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";

const LANGUAGES = [
  "English",
  "中文",
  "日本語",
  "한국어",
  "Español",
  "Français"
];
const KEYED_PROVIDERS = Object.keys(PROVIDERS).filter(
  (p) => p !== "workers-ai"
) as KeyedProvider[];

/** Persona, reply language, model provider and API keys. */
export function AssistantSettings({ agent }: { agent: AgentHandle }) {
  const [saved, setSaved] = useState<PublicSettings | null>(null);
  const [draft, setDraft] = useState<PublicSettings | null>(null);
  const [newKeys, setNewKeys] = useState<
    Partial<Record<KeyedProvider, string | null>>
  >({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(agent)
      .getSettings()
      .then((s) => {
        setSaved(s);
        setDraft(s);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [agent]);

  if (!draft || !saved) {
    return (
      <section className="card">
        <h2>Assistant</h2>
        <p className="muted">{error ?? "Loading…"}</p>
      </section>
    );
  }

  const set = <K extends keyof PublicSettings>(k: K, v: PublicSettings[K]) => {
    setDraft({ ...draft, [k]: v });
    setStatus(null);
  };

  const chooseProvider = (provider: ProviderId) => {
    // Keep the model if it already belongs to this provider.
    const model =
      provider === saved.provider
        ? saved.model
        : PROVIDERS[provider].defaultModel;
    setDraft({ ...draft, provider, model });
    setStatus(null);
  };

  const hasKey = (p: KeyedProvider) =>
    newKeys[p] !== undefined ? Boolean(newKeys[p]) : Boolean(draft.apiKeys[p]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const patch: SettingsPatch = {
      assistantName: draft.assistantName,
      instructions: draft.instructions,
      language: draft.language,
      provider: draft.provider,
      model: draft.model,
      apiKeys: newKeys
    };
    try {
      const next = await api(agent).updateSettings(patch);
      setSaved(next);
      setDraft(next);
      setNewKeys({});
      setStatus("Saved");
    } catch (err) {
      setError(errorText(err));
    }
  };

  const info = PROVIDERS[draft.provider];

  return (
    <form className="card" onSubmit={(e) => void save(e)}>
      <h2>Assistant</h2>
      <label>
        <span>Name</span>
        <input
          value={draft.assistantName}
          maxLength={40}
          onChange={(e) => set("assistantName", e.target.value)}
        />
      </label>
      <label>
        <span>Reply language</span>
        <input
          list="languages"
          value={draft.language === "auto" ? "" : draft.language}
          placeholder="Same as mine (auto)"
          maxLength={40}
          onChange={(e) => set("language", e.target.value || "auto")}
        />
        <datalist id="languages">
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </datalist>
      </label>
      <label>
        <span>Instructions</span>
        <textarea
          rows={4}
          maxLength={4000}
          value={draft.instructions}
          placeholder="Anything the assistant should always keep in mind — tone, who you are, what to avoid…"
          onChange={(e) => set("instructions", e.target.value)}
        />
      </label>

      <h2>Model</h2>
      <p className="muted">
        Used by the Think assistant and Telegram. The Pi assistant always uses
        Workers AI.
      </p>
      <label>
        <span>Provider</span>
        <select
          value={draft.provider}
          onChange={(e) => chooseProvider(e.target.value as ProviderId)}
        >
          {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
            <option
              key={p}
              value={p}
              disabled={p !== "workers-ai" && !hasKey(p)}
            >
              {PROVIDERS[p].label}
              {p !== "workers-ai" && !hasKey(p) ? " (add a key below)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Model</span>
        <input
          list="models"
          value={draft.model}
          placeholder="Model id"
          onChange={(e) => set("model", e.target.value)}
        />
        <datalist id="models">
          {info.suggestions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </datalist>
      </label>

      <h3>API keys</h3>
      <p className="muted">
        Stored in your assistant only and never shown again in full.
      </p>
      {KEYED_PROVIDERS.map((p) => {
        const pending = newKeys[p];
        const stored = draft.apiKeys[p];
        return (
          <div className="key-row" key={p}>
            <span className="key-label">{PROVIDERS[p].label}</span>
            {stored && pending === undefined ? (
              <>
                <code>••••{stored.last4}</code>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setNewKeys({ ...newKeys, [p]: null });
                    if (draft.provider === p) chooseProvider("workers-ai");
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <input
                type="password"
                autoComplete="off"
                placeholder={
                  pending === null ? "Removed — save to apply" : "Paste API key"
                }
                value={pending ?? ""}
                onChange={(e) =>
                  setNewKeys({ ...newKeys, [p]: e.target.value || undefined })
                }
              />
            )}
          </div>
        );
      })}

      <div className="actions">
        {error && <span className="error">{error}</span>}
        {status && <span className="muted">{status}</span>}
        <button type="submit" className="primary-btn">
          Save
        </button>
      </div>
    </form>
  );
}
