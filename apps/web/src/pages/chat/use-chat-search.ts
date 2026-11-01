import { useEffect, useState } from "react";

import type { ChatSummary } from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";

const DEBOUNCE_MS = 250;

/**
 * The history list for a search box: every chat while `query` is blank,
 * otherwise the server's matches once typing pauses.
 */
export function useChatSearch(agent: AgentHandle, query: string) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const needle = query.trim();
    let stale = false;
    const timer = setTimeout(
      () => {
        const rpc = api(agent);
        (needle ? rpc.searchChats(needle) : rpc.listChats())
          .then((list) => {
            if (stale) return;
            setChats(list);
            setError(null);
          })
          .catch((e: unknown) => {
            if (!stale) setError(errorText(e));
          });
      },
      needle ? DEBOUNCE_MS : 0
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [agent, query]);

  return { chats, setChats, error, setError };
}
