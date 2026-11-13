import { useState } from "react";

import { Check, Copy, Pencil, Retry, Share } from "../../components/icons";

/**
 * Copy and share buttons under a message, plus edit (user messages) or
 * regenerate (the last reply) when offered. Share uses the system sheet.
 * Mirrors `MessageActions` and `MessageMenu` in `MessageRow.swift`.
 */
export function MessageActions({
  text,
  align = "start",
  onEdit,
  onRegenerate
}: {
  text: string;
  align?: "start" | "end";
  onEdit?: () => void;
  onRegenerate?: () => void;
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
      <button
        type="button"
        className="msg-action"
        aria-label={copied ? "Copied" : "Copy"}
        title={copied ? "Copied" : "Copy"}
        onClick={() => void copy()}
      >
        {copied ? <Check /> : <Copy />}
      </button>
      {onEdit && (
        <button
          type="button"
          className="msg-action"
          aria-label="Edit"
          title="Edit"
          onClick={onEdit}
        >
          <Pencil />
        </button>
      )}
      {onRegenerate && (
        <button
          type="button"
          className="msg-action"
          aria-label="Regenerate"
          title="Regenerate"
          onClick={onRegenerate}
        >
          <Retry />
        </button>
      )}
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
