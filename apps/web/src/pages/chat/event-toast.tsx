import { useEffect } from "react";

import type { ServerEvent } from "@cot/shared";

const VISIBLE_MS = 8000;

/** What a toast or browser notification shows for a server event. */
export function describeEvent(event: ServerEvent) {
  switch (event.type) {
    case "reminder":
      return { icon: "⏰", title: "Reminder", body: event.description };
    case "task-result":
      return {
        icon: event.ok ? "✅" : "⚠️",
        title: event.ok ? event.description : `${event.description} failed`,
        body: event.text
      };
  }
}

/** A fired reminder or a finished task. Dismisses itself, or on click. */
export function EventToast({
  event,
  onDismiss
}: {
  event: ServerEvent;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(t);
  }, [event, onDismiss]);

  const { icon, title, body } = describeEvent(event);
  return (
    <button
      type="button"
      className="toast"
      aria-live="polite"
      onClick={onDismiss}
    >
      <span className="text-lg">{icon}</span>
      <span className="text-left">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="clamp block text-sm opacity-80">{body}</span>
      </span>
    </button>
  );
}
