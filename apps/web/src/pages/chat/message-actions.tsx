import { useState } from "react";

import { Check, Copy, Share } from "../../components/icons";

/** Copy and share buttons under a message. Share uses the system sheet. */
export function MessageActions({
  text,
  align = "start"
}: {
  text: string;
  align?: "start" | "end";
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
