import { useEffect, useRef } from "react";

/**
 * The end of a history list with more pages: loads the next one as it
 * scrolls into view. Mirrors the last-row `onAppear` in `HistoryView.swift`.
 */
export function HistoryMore({ onMore }: { onMore: () => void }) {
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onMore();
      },
      // The list scrolls, not the page; start a little before its end so
      // scrolling rarely stops.
      { root: node.parentElement, rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onMore]);

  return (
    <li ref={ref} className="history-more">
      <span className="muted">Loading…</span>
    </li>
  );
}
