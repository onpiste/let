import type { EmailSummary } from "@cot/shared";

import { categoryLabel, receivedText, senderText } from "../../lib/inbox";

/**
 * One email in the inbox list: sender, subject and the assistant's summary.
 * Mirrors `EmailRow` in InboxView.swift.
 */
export function EmailRow({
  email,
  onOpen
}: {
  email: EmailSummary;
  onOpen: () => void;
}) {
  const label = categoryLabel(email.category);
  return (
    <button
      type="button"
      className={`email-row ${email.read ? "" : "unread"}`}
      onClick={onOpen}
    >
      <span className="email-row-top">
        <span className="email-from">{senderText(email)}</span>
        <span className="muted small">{receivedText(email.receivedAt)}</span>
      </span>
      <span className="email-subject">{email.subject || "(no subject)"}</span>
      {email.summary && (
        <span className="muted small email-summary">{email.summary}</span>
      )}
      {label && <span className={`pill ${email.category ?? ""}`}>{label}</span>}
    </button>
  );
}
