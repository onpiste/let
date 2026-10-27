import { useCallback, useEffect, useState, type FormEvent } from "react";

import type { TelegramStatus, User } from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";
import { GoogleSettings } from "./google-settings";

/** Google services and the user's own Telegram bot. */
export function IntegrationSettings({
  user,
  agent,
  epoch
}: {
  user: User;
  agent: AgentHandle;
  /** Bumps on every (re)connect; changing the bot restarts the assistant. */
  epoch: number;
}) {
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api(agent)
      .getTelegramStatus()
      .then(setTelegram)
      .catch((e: unknown) => setError(errorText(e)));
  }, [agent]);

  useEffect(() => {
    if (epoch === 0) return;
    refresh();
    // Pick up the claim once the user comes back from Telegram.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh, epoch]);

  const run = async (action: () => Promise<TelegramStatus>) => {
    setError(null);
    setBusy(true);
    try {
      setTelegram(await action());
      setToken("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const connect = (e: FormEvent) => {
    e.preventDefault();
    void run(() => api(agent).connectTelegram(token));
  };

  const disconnect = () => {
    if (!confirm("Disconnect your Telegram bot from the assistant?")) return;
    void run(() => api(agent).disconnectTelegram());
  };

  return (
    <section className="card">
      <h2>Integrations</h2>
      <ul className="list">
        <GoogleSettings user={user} agent={agent} epoch={epoch} />
        <li className="stacked">
          <div className="row">
            <div>
              <div className="font-medium">Telegram</div>
              <div className="muted small">
                {telegram?.configured
                  ? `Your bot @${telegram.botUsername} — same conversation, memory and reminders as here`
                  : "Chat with your assistant through your own Telegram bot"}
              </div>
            </div>
            {telegram?.configured &&
              (telegram.linked ? (
                <span className="pill ready">connected</span>
              ) : (
                <span className="pill">waiting for Start</span>
              ))}
          </div>

          {telegram && !telegram.configured && (
            <form className="inline-form two" onSubmit={connect}>
              <input
                required
                type="password"
                autoComplete="off"
                value={token}
                placeholder="Bot token from @BotFather"
                onChange={(e) => setToken(e.target.value)}
              />
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? "Connecting…" : "Connect"}
              </button>
            </form>
          )}
          {telegram && !telegram.configured && (
            <p className="muted small">
              In Telegram, message @BotFather, send /newbot and paste the token
              it gives you. Only you will be able to use the bot.
            </p>
          )}

          {telegram?.configured && !telegram.webhookSet && (
            <p className="error small">
              The webhook isn’t set: Telegram needs a public https:// address,
              so connect the bot from the deployed app.
            </p>
          )}
          {telegram?.configured && !telegram.linked && (
            <div className="flex flex-wrap items-center gap-3">
              {telegram.claimUrl ? (
                <a
                  className="primary-btn"
                  href={telegram.claimUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open @{telegram.botUsername} and press Start
                </a>
              ) : (
                <button
                  className="primary-btn"
                  disabled={busy}
                  onClick={() =>
                    void run(() => api(agent).newTelegramClaimLink())
                  }
                >
                  New Start link
                </button>
              )}
              <span className="muted small">
                The first account to press Start becomes the bot’s owner.
              </span>
            </div>
          )}
          {telegram?.configured && (
            <div>
              <button className="link-btn" disabled={busy} onClick={disconnect}>
                Disconnect bot
              </button>
            </div>
          )}
        </li>
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
