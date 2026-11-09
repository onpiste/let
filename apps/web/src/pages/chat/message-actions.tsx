import { useState } from "react";

import { Check, Copy, Reply, Share } from "../../components/icons";

/**
 * Reply, copy and share buttons under a message. Share uses the system
 * sheet. Reply quotes the message in the composer for a follow-up.
 */
export function MessageActions({
  text,
  align = "start",
  onReply
}: {
  text: string;
  align?: "start" | "end";
  onReply?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // The Web Share API is missing on most desktop browsers; hide the button
  // there rather than offer one that does nothing.
  const canShare = typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the text is still selectable.
    }
  };

  const share = async () => {
    try {
      await navigator.share({ text });
    } catch {
      // Dismissed by the user, or the browser refused.
    }
  };

  return (
    <div className={`msg-actions ${align === "end" ? "justify-end" : ""}`}>
      {onReply && (
        <button
          type="button"
          className="msg-action"
          aria-label="Reply"
          title="Reply"
          onClick={onReply}
        >
          <Reply />
        </button>
      )}
      <button
        type="button"
        className="msg-action"
        aria-label={copied ? "Copied" : "Copy"}
        title={copied ? "Copied" : "Copy"}
        onClick={() => void copy()}
      >
        {copied ? <Check /> : <Copy />}
      </button>
      {canShare && (
        <button
          type="button"
          className="msg-action"
          aria-label="Share"
          title="Share"
          onClick={() => void share()}
        >
          <Share />
        </button>
      )}
    </div>
  );
}
