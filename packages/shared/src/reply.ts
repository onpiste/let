/**
 * Replying to one message. The client puts a short copy of the message being
 * answered in the new user message's `metadata.replyTo`, so every client can
 * show it above the bubble and the server can hand it to the model as context
 * for a targeted follow-up. The copy travels with the message, so it still
 * shows (and still means the same) if the original scrolls out of reach.
 */

/** Longest quote kept; a long answer is cut, not refused. */
export const REPLY_QUOTE_MAX_CHARS = 4000;

export type ReplyQuote = {
  /** The id of the message replied to. */
  id: string;
  /** Who wrote it. */
  role: "user" | "assistant";
  /** Its text, at most `REPLY_QUOTE_MAX_CHARS` long. */
  text: string;
};

function clip(text: string) {
  const trimmed = text.trim();
  return trimmed.length > REPLY_QUOTE_MAX_CHARS
    ? `${trimmed.slice(0, REPLY_QUOTE_MAX_CHARS - 1)}…`
    : trimmed;
}

/** The quote to send for a reply to this message, or null if it has no text. */
export function makeReplyQuote(
  id: string,
  role: ReplyQuote["role"],
  text: string
): ReplyQuote | null {
  const clipped = clip(text);
  return id && clipped ? { id, role, text: clipped } : null;
}

/**
 * The quote a message replies to, if it carries a valid one. Metadata comes
 * from the client, so it is checked and clipped here, not trusted.
 */
export function messageReplyTo(message: {
  metadata?: unknown;
}): ReplyQuote | undefined {
  const meta = message.metadata;
  if (typeof meta !== "object" || meta === null) return undefined;
  const quote = (meta as { replyTo?: unknown }).replyTo;
  if (typeof quote !== "object" || quote === null) return undefined;
  const { id, role, text } = quote as Record<string, unknown>;
  if (typeof id !== "string" || !id || id.length > 64) return undefined;
  if (role !== "user" && role !== "assistant") return undefined;
  if (typeof text !== "string") return undefined;
  return makeReplyQuote(id, role, text) ?? undefined;
}

/** What the model reads before a reply, so it answers about that message. */
export function replyContextText(quote: ReplyQuote): string {
  const author =
    quote.role === "assistant"
      ? "your earlier message"
      : "an earlier message of theirs";
  return [
    `The user is replying to ${author}, quoted here:`,
    "<quoted-message>",
    quote.text,
    "</quoted-message>",
    "Answer their message below with that quoted message as its subject."
  ].join("\n");
}
