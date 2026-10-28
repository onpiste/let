import type { UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";

export type QueuedMessage = {
  id: number;
  parts: UIMessage["parts"];
};

/**
 * Messages written while the assistant is still answering. The server only
 * ever sees one request at a time: when a turn ends, the next queued message
 * is sent.
 */
export function useSendQueue(
  busy: boolean,
  send: (parts: UIMessage["parts"]) => void
) {
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const nextId = useRef(0);

  const enqueue = useCallback((parts: UIMessage["parts"]) => {
    setQueue((q) => [...q, { id: nextId.current++, parts }]);
  }, []);

  const remove = useCallback((id: number) => {
    setQueue((q) => q.filter((m) => m.id !== id));
  }, []);

  const clear = useCallback(() => setQueue([]), []);

  // Sending only on the busy -> idle edge: `busy` lags behind `send`, so
  // reacting to the queue itself would fire the whole queue at once.
  const wasBusy = useRef(false);
  useEffect(() => {
    const finished = wasBusy.current && !busy;
    wasBusy.current = busy;
    const [next, ...rest] = queue;
    if (!finished || !next) return;
    setQueue(rest);
    send(next.parts);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- edge-triggered
  }, [busy]);

  return { queue, enqueue, remove, clear };
}
