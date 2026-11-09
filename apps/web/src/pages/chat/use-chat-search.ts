import { useCallback, useEffect, useRef, useState } from "react";

import { appendChats, type ChatSummary } from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";

const DEBOUNCE_MS = 250;

/**
 * The history list for a search box: the newest chats while `query` is
 * blank, a page at a time as `more` is called, otherwise the server's
 * matches once typing pauses. Mirrors `HistoryView.swift`'s loading.
 */
export function useChatSearch(agent: AgentHandle, query: string) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The cursor of the page after the ones shown, with the query it belongs
   * to: a cursor from before the query changed is no use.
   */
  const [paging, setPaging] = useState<{ query: string; next: string } | null>(
    null
  );
  const needle = query.trim();
  const next = paging?.query === needle ? paging.next : null;
  const loading = useRef(false);
  // Bumped when the query changes, so a late page of the old list is dropped.
  const generation = useRef(0);

  useEffect(() => {
    const run = ++generation.current;
    loading.current = false;
    const timer = setTimeout(
      () => {
        const rpc = api(agent);
        const request = needle
          ? rpc
              .searchChats(needle)
              .then((list) => ({ chats: list, next: null }))
          : rpc.listChatPage();
        request
          .then((page) => {
            if (run !== generation.current) return;
            setChats(page.chats);
            setPaging(page.next ? { query: needle, next: page.next } : null);
            setError(null);
          })
          .catch((e: unknown) => {
            if (run === generation.current) setError(errorText(e));
          });
      },
      needle ? DEBOUNCE_MS : 0
    );
    return () => clearTimeout(timer);
  }, [agent, needle]);

  /** Loads the next page, once at a time. */
  const more = useCallback(() => {
    if (!next || loading.current) return;
    const run = generation.current;
    loading.current = true;
    api(agent)
      .listChatPage(next)
      .then((page) => {
        if (run !== generation.current) return;
        setChats((shown) => appendChats(shown ?? [], page.chats));
        setPaging(page.next ? { query: "", next: page.next } : null);
        setError(null);
      })
      .catch((e: unknown) => {
        if (run === generation.current) setError(errorText(e));
      })
      .finally(() => {
        if (run === generation.current) loading.current = false;
      });
  }, [agent, next]);

  return { chats, setChats, error, setError, hasMore: next !== null, more };
}
