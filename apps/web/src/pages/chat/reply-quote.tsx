import type { ReplyQuote } from "@cot/shared";

import { X } from "../../components/icons";

/** Element id of a message in the list, so a quote can jump to it. */
export const messageAnchor = (id: string) => `msg-${id}`;

/**
 * The message a user replied to, small and dim above their bubble, joined
 * to it by a curved line. Tapping it scrolls to the original when it is
 * still in the chat. Mirrors `QuotedMessageView` in ReplyQuote.swift.
 */
export function QuotedMessage({ quote }: { quote: ReplyQuote }) {
  const jump = () =>
    document
      .getElementById(messageAnchor(quote.id))
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  return (
    <button
      type="button"
      className="reply-quote"
      onClick={jump}
      aria-label={`Replying to: ${quote.text}`}
    >
      <span className="reply-quote-text">{quote.text}</span>
    </button>
  );
}

/**
 * Above the composer while replying: what is being answered, and a button
 * to stop replying. Mirrors `ReplyPreview` in ReplyQuote.swift.
 */
export function ReplyPreview({
  quote,
  onCancel
}: {
  quote: ReplyQuote;
  onCancel: () => void;
}) {
  return (
    <div className="reply-preview">
      <div className="reply-preview-body">
        <span className="reply-preview-label">
          {quote.role === "assistant" ? "Replying to Cot" : "Replying to you"}
        </span>
        <span className="reply-preview-text">{quote.text}</span>
      </div>
      <button
        type="button"
        className="reply-preview-close"
        onClick={onCancel}
        aria-label="Cancel reply"
        title="Cancel reply"
      >
        <X />
      </button>
    </div>
  );
}
