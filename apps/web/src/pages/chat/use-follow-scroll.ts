import { useCallback, useEffect, useRef, useState } from "react";

// Within this many pixels of the end counts as "at the bottom".
const NEAR_END = 80;

/**
 * Keeps a scroll container pinned to its end while content grows, until the
 * user scrolls up (also mid-stream). Auto-scrolls are instant and only move
 * down, so any upward movement is the user's and ends the following; reaching
 * the bottom again resumes it.
 */
export function useFollowScroll(content: unknown) {
  const ref = useRef<HTMLElement>(null);
  const following = useRef(true);
  const lastTop = useRef(0);
  const [away, setAway] = useState(false);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_END;
    if (el.scrollTop < lastTop.current - 1) following.current = false;
    else if (atEnd) following.current = true;
    lastTop.current = el.scrollTop;
    setAway(!atEnd && !following.current);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [content]);

  /** Jump to the newest message and keep following from there. */
  const follow = useCallback(() => {
    const el = ref.current;
    following.current = true;
    setAway(false);
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  return { ref, away, onScroll, follow };
}
