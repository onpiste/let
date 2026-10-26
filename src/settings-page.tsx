import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAgent } from "agents/react";
import type { MCPServersState } from "agents";
import type { User } from "./auth";
import type { Assistant } from "./server";
import {
  PROVIDERS,
  type KeyedProvider,
  type ProviderId,
  type PublicSettings,
  type SettingsPatch
} from "./settings";

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

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Settings for the signed-in user's assistant. Talks to the same Think
 * assistant as the chat, over its WebSocket (callable methods + MCP state).
 */
export default function SettingsPage({
  user,
  onBack
}: {
  user: User;
  onBack: () => void;
}) {
  const [mcp, setMcp] = useState<MCPServersState | null>(null);
  const agent = useAgent<Assistant>({
    agent: "Assistant",
    basePath: "chat",
    onMcpUpdate: useCallback((state: MCPServersState) => setMcp(state), [])
  });

  return (
    <div className="app">
      <header className="topbar">
        <div className="flex items-center gap-2">
          <button className="back-btn" onClick={onBack}>
            ← Back
          </button>
          <span className="font-semibold tracking-tight">Settings</span>
        </div>
      </header>
      <main className="scroll">
        <div className="column settings">
          <AssistantSettings agent={agent} />
          <McpSettings agent={agent} state={mcp} />
          <Integrations user={user} />
        </div>
      </main>
    </div>
  );
}

type AgentHandle = ReturnType<typeof useAgent<Assistant>>;

// The generated stub type for a Think agent is untyped, so pin the
// signatures of the callables this page uses (see Assistant in server.ts).
type AddMcpResult =
  | { id: string; state: "ready" }
  | { id: string; state: "authenticating"; authUrl: string };

function api(agent: AgentHandle) {
  return {
    getSettings: () => agent.stub.getSettings() as Promise<PublicSettings>,
    updateSettings: (patch: SettingsPatch) =>
      agent.stub.updateSettings(patch) as Promise<PublicSettings>,
    addMcp: (name: string, url: string) =>
      agent.stub.addMcp(name, url) as Promise<AddMcpResult>,
    removeMcp: (id: string) => agent.stub.removeMcp(id) as Promise<void>
  };
}

// ── Assistant + model ────────────────────────────────────────────────

function AssistantSettings({ agent }: { agent: AgentHandle }) {
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
    <form className="card" onSubmit={save}>
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
              disabled={p !== "workers-ai" && !hasKey(p as KeyedProvider)}
            >
              {PROVIDERS[p].label}
              {p !== "workers-ai" && !hasKey(p as KeyedProvider)
                ? " (add a key below)"
                : ""}
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

// ── MCP servers ──────────────────────────────────────────────────────

function McpSettings({
  agent,
  state
}: {
  agent: AgentHandle;
  state: MCPServersState | null;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    // Open the popup now so it isn't blocked; it is used if OAuth is needed.
    const popup = window.open("", "_blank", "width=600,height=720");
    setBusy(true);
    try {
      const result = await api(agent).addMcp(name, url);
      if (result.state === "authenticating" && popup) {
        popup.location.href = result.authUrl;
      } else {
        popup?.close();
      }
      setName("");
      setUrl("");
    } catch (err) {
      popup?.close();
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const servers = Object.entries(state?.servers ?? {});

  return (
    <section className="card">
      <h2>MCP servers</h2>
      <p className="muted">
        Tools from connected servers are available to the Think assistant in
        every chat, including Telegram.
      </p>
      {servers.length === 0 ? (
        <p className="muted">No servers yet.</p>
      ) : (
        <ul className="list">
          {servers.map(([id, server]) => {
            const tools =
              state?.tools.filter((t) => t.serverId === id).length ?? 0;
            return (
              <li key={id}>
                <div>
                  <div className="font-medium">{server.name}</div>
                  <div className="muted small">{server.server_url}</div>
                  <div className="small">
                    <span className={`pill ${server.state}`}>
                      {server.state}
                    </span>
                    {server.state === "ready" && ` · ${tools} tools`}
                    {server.error && (
                      <span className="error"> · {server.error}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {server.state === "authenticating" && server.auth_url && (
                    <a
                      className="link-btn"
                      href={server.auth_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Authorize
                    </a>
                  )}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                      api(agent)
                        .removeMcp(id)
                        .catch((e: unknown) => setError(errorText(e)))
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form className="inline-form" onSubmit={add}>
        <input
          required
          value={name}
          placeholder="Name"
          onChange={(e) => setName(e.target.value)}
        />
        <input
          required
          type="url"
          value={url}
          placeholder="https://example.com/mcp"
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? "Connecting…" : "Add"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

// ── Integrations ─────────────────────────────────────────────────────

type TelegramStatus = { linked: boolean; botUsername: string };

function Integrations({ user }: { user: User }) {
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch("/telegram/status")
      .then((r) => (r.ok ? (r.json() as Promise<TelegramStatus>) : null))
      .then(setTelegram)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    // Pick up the link once the user comes back from Telegram.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const connect = async () => {
    setError(null);
    // Open the tab synchronously so popup blockers allow it.
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const res = await fetch("/telegram/link", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!data.url) throw new Error(data.error ?? "Could not create a link");
      if (tab) tab.location.href = data.url;
      else window.location.href = data.url;
    } catch (e) {
      tab?.close();
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Telegram from your assistant?")) return;
    setBusy(true);
    await fetch("/telegram/unlink", { method: "POST" }).catch(() => {});
    setBusy(false);
    refresh();
  };

  return (
    <section className="card">
      <h2>Integrations</h2>
      <ul className="list">
        <li>
          <div>
            <div className="font-medium">Google</div>
            <div className="muted small">Signed in as {user.email}</div>
          </div>
          <span className="pill ready">connected</span>
        </li>
        <li>
          <div>
            <div className="font-medium">Telegram</div>
            <div className="muted small">
              {telegram?.linked
                ? `Chat with @${telegram.botUsername} — same conversation, memory and reminders`
                : "Chat with your assistant from Telegram"}
            </div>
          </div>
          {telegram &&
            (telegram.linked ? (
              <button className="link-btn" disabled={busy} onClick={disconnect}>
                Disconnect
              </button>
            ) : (
              <button className="primary-btn" disabled={busy} onClick={connect}>
                Connect
              </button>
            ))}
        </li>
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
