import { useEffect } from "react";

const VISIBLE_MS = 8000;

export type Notice = { icon: string; title: string; text: string };

/** A fired reminder or a new email. Dismisses itself, or on click. */
export function NoticeToast({
  notice,
  onDismiss
}: {
  notice: Notice;
  onDismiss: () => void;
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
      onClick={onDismiss}
    >
      <span className="text-lg">{notice.icon}</span>
      <span className="text-left">
        <span className="block text-sm font-semibold">{notice.title}</span>
        <span className="block text-sm opacity-80">{notice.text}</span>
      </span>
    </button>
  );
}
