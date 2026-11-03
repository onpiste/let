import { useCallback, useEffect, useState } from "react";

import type { AppsStatus, AppStatus } from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";

/**
 * One-tap apps (Gmail, Calendar, Notion, …) through Composio. Hidden when
 * the deployment has no Composio key. Mirrors AppsSection.swift.
 */
export function AppsSettings({
  agent,
  epoch
}: {
  agent: AgentHandle;
  /** Bumps on every (re)connect. */
  epoch: number;
}) {
  const [status, setStatus] = useState<AppsStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api(agent)
      .listApps()
      .then(setStatus)
      .catch((e: unknown) => setError(errorText(e)));
  }, [agent]);

  useEffect(() => {
    if (epoch === 0) return;
    refresh();
    // Pick up a sign-in finished in another tab or window.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh, epoch]);

  const connect = async (slug: string) => {
    setError(null);
    // Open the popup now so it isn't blocked, then point it at the sign-in.
    const popup = window.open("", "_blank", "width=600,height=720");
    setBusy(slug);
    try {
      const { url } = await api(agent).connectApp(slug);
      if (popup) {
        popup.location.href = url;
        const timer = window.setInterval(() => {
          if (!popup.closed) return;
          window.clearInterval(timer);
          refresh();
        }, 1000);
      } else {
        window.open(url, "_blank");
      }
    } catch (e) {
      popup?.close();
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (app: AppStatus) => {
    if (!confirm(`Disconnect ${app.name}?`)) return;
    setError(null);
    setBusy(app.slug);
    try {
      setStatus(await api(agent).disconnectApp(app.slug));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (!status?.available) return null;

  return (
    <section className="card">
      <h2>Apps</h2>
      <p className="muted">
        Connect your accounts in one tap. The assistant can then read and act in
        them in every chat, including Telegram.
      </p>
      <ul className="list">
        {status.apps.map((app) => (
          <li key={app.slug}>
            <div>
              <div className="font-medium">{app.name}</div>
              {app.connected && (
                <span className="pill ready small">connected</span>
              )}
              {app.problem && (
                <span className="pill failed small">
                  {app.problem.toLowerCase()}
                </span>
              )}
            </div>
            {app.connected ? (
              <button
                type="button"
                className="link-btn"
                disabled={busy !== null}
                onClick={() => void disconnect(app)}
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                className="primary-btn"
                disabled={busy !== null}
                onClick={() => void connect(app.slug)}
              >
                {busy === app.slug ? "Opening…" : "Connect"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
