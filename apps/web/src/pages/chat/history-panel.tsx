import { useEffect, useState } from "react";

import { CHAT_QUERY_LENGTH } from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";
import { useChatSearch } from "./use-chat-search";

/**
 * Conversations in a drawer from the left: search them, open one, delete
 * one, or start a new one. A chat whose reply is still running says so;
 * switching away never stops it. Mirrors `HistoryView.swift`.
 */
export function HistoryPanel({
  agent,
  currentId,
  onOpen,
  onNew,
  onClose
}: {
  agent: AgentHandle;
  /** The chat this page shows. */
  currentId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
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

  const open = async (id: string) => {
    try {
      await api(agent).openChat(id);
      onOpen(id);
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async (id: string) => {
    try {
      const list = await api(agent).deleteChat(id);
      // The open chat is gone: show the one the server picks next.
      if (id === currentId) {
        onOpen(await api(agent).currentChat());
      }
      if (!searching) setChats(list);
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
            onClick={() => {
              onNew();
              onClose();
            }}
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
            <li key={chat.id} className={chat.id === currentId ? "on" : ""}>
              <button
                className="history-item"
                onClick={() => void open(chat.id)}
              >
                <span>{chat.title}</span>
                {chat.snippet && <em>{chat.snippet}</em>}
                <small>
                  {chat.running && <b className="running">Answering… · </b>}
                  {new Date(chat.updatedAt).toLocaleString()}
                </small>
              </button>
              <button
                className="icon-btn"
                aria-label={`Delete ${chat.title}`}
                onClick={() => {
                  if (confirm("Delete this conversation?")) {
                    void remove(chat.id);
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
