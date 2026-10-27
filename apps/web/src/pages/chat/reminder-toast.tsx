import { useEffect } from "react";

const VISIBLE_MS = 8000;

/** A fired reminder. Dismisses itself, or on click. */
export function ReminderToast({
  text,
  onDismiss
}: {
  text: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(t);
  }, [text, onDismiss]);

  return (
    <button
      type="button"
      className="toast"
      aria-live="polite"
      onClick={onDismiss}
    >
      <span className="text-lg">⏰</span>
      <span className="text-left">
        <span className="block text-sm font-semibold">Reminder</span>
        <span className="block text-sm opacity-80">{text}</span>
      </span>
    </button>
  );
}
