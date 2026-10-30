import type { MCPServersState } from "agents";
import { useState, type FormEvent } from "react";

import { CONNECTOR_PRESETS } from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";

/** Remote MCP servers: list, add (with an OAuth popup if needed), remove. */
export function McpSettings({
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
      <h2>Connectors (MCP servers)</h2>
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
                    onClick={() => {
                      api(agent)
                        .removeMcp(id)
                        .catch((e: unknown) => setError(errorText(e)));
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form className="inline-form" onSubmit={(e) => void add(e)}>
        <select
          value=""
          onChange={(e) => {
            const preset = CONNECTOR_PRESETS.find(
              (p) => p.name === e.target.value
            );
            if (!preset) return;
            setName(preset.name);
            setUrl(preset.url);
          }}
        >
          <option value="">Popular…</option>
          {CONNECTOR_PRESETS.map((p) => (
            <option key={p.name}>{p.name}</option>
          ))}
        </select>
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
