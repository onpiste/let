import { useEffect, useState } from "react";

import type { ChatSummary } from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";

/** Saved conversations: open one, delete one, or start a new one. */
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
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(agent)
      .listChats()
      .then(setChats)
      .catch((e: unknown) => setError(errorText(e)));
  }, [agent]);

  const run = async (action: Promise<ChatSummary[]>, close: boolean) => {
    try {
      setChats(await action);
      if (close) {
        onSwitch();
        onClose();
      }
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
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
      {error && <p className="error">{error}</p>}
      {chats?.length === 0 && <p className="muted">No conversations yet.</p>}
      {!chats && !error && <p className="muted">Loading…</p>}
      <ul>
        {chats?.map((chat) => (
          <li key={chat.id} className={chat.active ? "on" : ""}>
            <button
              className="history-item"
              onClick={() => void run(api(agent).openChat(chat.id), true)}
            >
              <span>{chat.title}</span>
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
  );
}
