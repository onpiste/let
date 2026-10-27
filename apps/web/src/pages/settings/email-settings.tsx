import { useCallback, useEffect, useState, type FormEvent } from "react";

import type { EmailStatus } from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";

/** The assistant's own email address and who may send to it. */
export function EmailSettings({
  agent,
  epoch
}: {
  agent: AgentHandle;
  /** Bumps on every (re)connect. */
  epoch: number;
}) {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [alias, setAlias] = useState("");
  const [senders, setSenders] = useState("");
  const [anyone, setAnyone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = useCallback((next: EmailStatus) => {
    setStatus(next);
    if (!next.enabled) return;
    setAlias(next.alias);
    setSenders(next.trustedSenders.join("\n"));
    setAnyone(next.acceptFromAnyone);
  }, []);

  useEffect(() => {
    if (epoch === 0) return;
    api(agent)
      .getEmailStatus()
      .then(show)
      .catch((e: unknown) => setError(errorText(e)));
  }, [agent, epoch, show]);

  const run = async (action: () => Promise<EmailStatus>) => {
    setError(null);
    setBusy(true);
    try {
      show(await action());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const trustedSenders = senders.split(/[\s,]+/).filter(Boolean);
    void run(() =>
      api(agent).updateEmailPolicy({ acceptFromAnyone: anyone, trustedSenders })
    );
  };

  const rename = (e: FormEvent) => {
    e.preventDefault();
    const warning =
      "Change the address? Mail to the current one will bounce, and its name becomes free for anyone to take.";
    if (!confirm(warning)) return;
    void run(() => api(agent).setEmailAlias(alias));
  };

  const copy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the address is still selectable.
    }
  };

  if (status && !status.enabled) return null;

  return (
    <section className="card">
      <h2>Email</h2>
      {status?.enabled && (
        <ul className="list">
          <li className="stacked">
            <div className="row">
              <div>
                <div className="font-medium select-all">{status.address}</div>
                <div className="muted small">
                  Your assistant’s own address. Mail to it lands in its inbox;
                  ask it about your email in chat.
                </div>
              </div>
              <button
                type="button"
                className="link-btn"
                onClick={() => void copy(status.address)}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <form className="flex items-center gap-2" onSubmit={rename}>
              <input
                required
                aria-label="Address name"
                autoComplete="off"
                spellCheck={false}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
              <span className="muted">@{status.domain}</span>
              <button
                type="submit"
                className="primary-btn"
                disabled={busy || alias.trim().toLowerCase() === status.alias}
              >
                Change
              </button>
            </form>
            <p className="muted small">
              To pass on Gmail: Settings → Forwarding → add this address. The
              confirmation link arrives here and on Telegram; then add a filter
              that forwards the mail you want the assistant to see.
            </p>
          </li>
          <li className="stacked">
            <form className="flex flex-col gap-2" onSubmit={save}>
              <div className="flex items-start gap-2">
                <input
                  id="accept-anyone"
                  type="checkbox"
                  className="mt-1"
                  checked={anyone}
                  aria-describedby="accept-anyone-hint"
                  onChange={(e) => setAnyone(e.target.checked)}
                />
                <div>
                  <label className="font-medium" htmlFor="accept-anyone">
                    Accept mail from anyone
                  </label>
                  <div id="accept-anyone-hint" className="muted small">
                    {anyone
                      ? "Strangers’ mail is kept but marked as from an unknown sender."
                      : "Only you and your trusted senders can reach it; other mail bounces."}
                  </div>
                </div>
              </div>
              <label className="font-medium" htmlFor="trusted-senders">
                Trusted senders
              </label>
              <textarea
                id="trusted-senders"
                rows={3}
                value={senders}
                placeholder="one address per line"
                onChange={(e) => setSenders(e.target.value)}
              />
              <div>
                <button type="submit" className="primary-btn" disabled={busy}>
                  Save
                </button>
              </div>
            </form>
          </li>
        </ul>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
