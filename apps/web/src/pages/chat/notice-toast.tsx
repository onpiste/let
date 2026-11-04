import { useEffect } from "react";

const VISIBLE_MS = 8000;

export type Notice = {
  icon: string;
  title: string;
  text: string;
  /** A new email's id: clicking opens it in the inbox. */
  emailId?: number;
};

/**
 * A fired reminder or a new email. Dismisses itself; a click opens what it
 * is about (`onOpen`), or just dismisses it.
 */
export function NoticeToast({
  notice,
  onDismiss,
  onOpen
}: {
  notice: Notice;
  onDismiss: () => void;
  onOpen?: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(t);
  }, [notice, onDismiss]);

  return (
    <button
      type="button"
      className="toast"
      aria-live="polite"
      onClick={onOpen ?? onDismiss}
    >
      <span className="text-lg">{notice.icon}</span>
      <span className="text-left">
        <span className="block text-sm font-semibold">{notice.title}</span>
        <span className="block text-sm opacity-80">{notice.text}</span>
      </span>
    </button>
  );
}
