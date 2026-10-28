import type { QueuedMessage } from "./use-send-queue";

function label(message: QueuedMessage) {
  const text = message.parts.find((p) => p.type === "text");
  const files = message.parts.filter((p) => p.type === "file").length;
  const body = text && "text" in text ? text.text : "";
  return files > 0 ? `${body} (+${files} file${files > 1 ? "s" : ""})` : body;
}

/** Messages waiting for the current answer to finish. */
export function QueuedList({
  queue,
  onRemove
}: {
  queue: QueuedMessage[];
  onRemove: (id: number) => void;
}) {
  if (queue.length === 0) return null;
  return (
    <div className="queued">
      {queue.map((m) => (
        <span className="chip-file" key={m.id}>
          {label(m)}
          <button
            type="button"
            aria-label="Remove queued message"
            onClick={() => onRemove(m.id)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
