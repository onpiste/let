import type { EmailCategory, EmailSummary } from "@cot/shared";

/** How a category reads in the list; null shows nothing (not sorted yet). */
export function categoryLabel(category: EmailCategory | null) {
  switch (category) {
    case "action":
      return "Needs action";
    case "notify":
      return "FYI";
    case "ignore":
      return "Low priority";
    case null:
      return null;
  }
}

/** The sender, flagged when it is a stranger. */
export function senderText(email: Pick<EmailSummary, "from" | "trusted">) {
  return email.trusted ? email.from : `${email.from} · unknown sender`;
}

/**
 * When the mail arrived, in the reader's time. The server stores SQLite's
 * `YYYY-MM-DD HH:MM:SS` in UTC; today shows the time, older mail the date.
 */
export function receivedText(receivedAt: string) {
  const date = new Date(`${receivedAt.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return receivedAt;
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** A socket message as a loose object; `{}` for anything but JSON. */
export function parseEvent(data: unknown): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(String(data));
    // Untrusted shape: callers read fields defensively.
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The unread count from a server event, if it carries one. */
export function unreadOf(event: { type?: unknown; unread?: unknown }) {
  const counts = event.type === "email" || event.type === "inbox";
  return counts && typeof event.unread === "number" ? event.unread : null;
}
