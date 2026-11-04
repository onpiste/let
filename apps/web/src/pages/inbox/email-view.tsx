import type { EmailDetail } from "@cot/shared";

import { categoryLabel, receivedText, senderText } from "../../lib/inbox";

/**
 * One email: the assistant's summary, the plain-text body, and what to do
 * with it. Mirrors `EmailView.swift`.
 */
export function EmailView({
  email,
  busy,
  onAsk,
  onArchive
}: {
  email: EmailDetail;
  busy: boolean;
  /** Starts a chat in which the assistant reads it. */
  onAsk: () => void;
  onArchive: () => void;
}) {
  const label = categoryLabel(email.category);
  return (
    <article className="card email-view">
      <h2>{email.subject || "(no subject)"}</h2>
      <p className="muted">
        {senderText(email)} · {receivedText(email.receivedAt)}
      </p>
      {!email.trusted && (
        <p className="error">
          Not from you or a trusted sender. Be careful with links and requests
          in it.
        </p>
      )}
      {email.summary && (
        <p className="email-summary-box">
          {label && (
            <span className={`pill ${email.category ?? ""}`}>{label}</span>
          )}{" "}
          {email.summary}
        </p>
      )}
      <div className="actions email-actions">
        <button
          type="button"
          className="link-btn"
          disabled={busy}
          onClick={onArchive}
        >
          {email.archived ? "Move to inbox" : "Archive"}
        </button>
        <button
          type="button"
          className="primary-btn"
          disabled={busy}
          onClick={onAsk}
        >
          Ask Cot
        </button>
      </div>
      {email.attachments.length > 0 && (
        <p className="muted small">
          Attachments (not kept): {email.attachments.join(", ")}
        </p>
      )}
      {/* Plain text from the server, rendered as text: never as HTML. */}
      <div className="email-body">{email.body}</div>
    </article>
  );
}
