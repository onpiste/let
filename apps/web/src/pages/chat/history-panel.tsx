import { useEffect, useState } from "react";

import { CHAT_QUERY_LENGTH, type ChatSummary } from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";
import { useChatSearch } from "./use-chat-search";

/**
 * Saved conversations in a drawer from the left: search them, open one,
 * delete one, or start a new one. Mirrors `HistoryView.swift`.
 */
export function HistoryPanel({
  agent,
  onSwitch,
  onClose
}: {
  agent: AgentHandle;
  /** The open conversation changed (opened or new). */
  onSwitch: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const { chats, setChats, error, setError } = useChatSearch(agent, query);
  const searching = query.trim() !== "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (action: Promise<ChatSummary[]>, close: boolean) => {
    try {
      const list = await action;
      if (close) {
        onSwitch();
        onClose();
      } else if (!searching) setChats(list);
      else
        setChats(
          (old) => old?.filter((c) => list.some((n) => n.id === c.id)) ?? null
        );
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <>
      <button
        className="history-backdrop"
        aria-label="Close history"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside className="history" aria-label="Chat history">
        <div className="history-head">
          <strong>History</strong>
          <button
            className="link-btn"
            onClick={() => void run(api(agent).newChat(), true)}
          >
            New chat
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <input
          className="history-search"
          type="search"
          placeholder="Search chats"
          aria-label="Search chats"
          maxLength={CHAT_QUERY_LENGTH}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        {chats?.length === 0 && (
          <p className="muted">
            {searching ? "No matching chats." : "No conversations yet."}
          </p>
        )}
        {!chats && !error && <p className="muted">Loading…</p>}
        <ul>
          {chats?.map((chat) => (
            <li key={chat.id} className={chat.active ? "on" : ""}>
              <button
                className="history-item"
                onClick={() => void run(api(agent).openChat(chat.id), true)}
              >
                <span>{chat.title}</span>
                {chat.snippet && <em>{chat.snippet}</em>}
                <small>{new Date(chat.updatedAt).toLocaleString()}</small>
              </button>
              <button
                className="icon-btn"
                aria-label={`Delete ${chat.title}`}
                onClick={() => {
                  if (confirm("Delete this conversation?")) {
                    void run(api(agent).deleteChat(chat.id), false);
                  }
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
