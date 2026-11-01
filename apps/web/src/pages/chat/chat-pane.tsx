import { useAgentChat } from "@cloudflare/think/react";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useState } from "react";

import {
  ASSISTANT,
  chatSocketPath,
  type ResearchJob,
  type User
} from "@cot/shared";

import { ArrowDown } from "../../components/icons";
import {
  checkTotalSize,
  readAttachment,
  type Attachment
} from "../../lib/attachments";
import { loadChatCache, saveChatCache } from "../../lib/chat-cache";
import { errorText } from "../../lib/errors";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import type { Notice } from "./notice-toast";
import { QueuedList } from "./queued-list";
import { ResearchList } from "./research-list";
import { useFollowScroll } from "./use-follow-scroll";
import { useReconnectOnResume } from "./use-reconnect";
import { useSendQueue } from "./use-send-queue";

/**
 * One conversation: its own socket to that chat's agent, its messages and
 * composer. The page mounts it with `key={chatId}`, so switching chats
 * closes this socket while the server keeps answering in the background;
 * opening the chat again resumes the stream. Mirrors ChatStore.swift.
 */
export function ChatPane({
  user,
  chatId,
  draft,
  research,
  toolLabels,
  onNotice,
  onFirstSend,
  onMissing
}: {
  user: User;
  chatId: string;
  /** Text to start the message box with. */
  draft: string;
  research: ResearchJob[];
  toolLabels: Record<string, string>;
  onNotice: (notice: Notice) => void;
  /** The user sent something (a good moment to ask for notifications). */
  onFirstSend: () => void;
  /** The server doesn't know this chat (deleted elsewhere). */
  onMissing: () => void;
}) {
  const [input, setInput] = useState(draft);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const agent = useAgent({
    agent: ASSISTANT.agent,
    basePath: ASSISTANT.basePath,
    path: chatSocketPath(chatId),
    connectionTimeout: 10_000,
    maxReconnectionDelay: 3_000
  });
  useReconnectOnResume(agent);

  // A 4xx close (the chat was deleted) is final; open another one.
  const missing = agent.connectionError !== null;
  useEffect(() => {
    if (missing) onMissing();
  }, [missing, onMissing]);

  const { messages, sendMessage, stop, status, addToolApprovalResponse } =
    useAgentChat({
      agent,
      experimental_throttle: 50,
      // Show the cached chat at once; the socket sends the real list on
      // connect. Without a cache, fetch it like the SDK does.
      getInitialMessages: async ({ url }) => {
        const cached = loadChatCache(user.id);
        if (cached?.chatId === chatId) return cached.messages;
        if (!url) return [];
        const res = await fetch(`${url}/get-messages`).catch(() => null);
        // Trust boundary: the server's UIMessage list.
        return res?.ok ? ((await res.json()) as UIMessage[]) : [];
      }
    });

  const busy = status === "streaming" || status === "submitted";

  // Not mid-stream: that would write the whole chat on every chunk.
  useEffect(() => {
    if (!busy) saveChatCache(user.id, chatId, messages);
  }, [busy, messages, user.id, chatId]);
  const last = messages[messages.length - 1];
  const waiting = busy && (!last || last.role === "user");
  const submit = useCallback(
    (parts: UIMessage["parts"]) =>
      void sendMessage({
        role: "user",
        parts,
        metadata: { createdAt: Date.now() }
      }),
    [sendMessage]
  );
  const queued = useSendQueue(busy, submit);

  const { ref: scrollRef, away, onScroll, follow } = useFollowScroll(messages);

  const attach = async (files: File[]) => {
    try {
      const added = await Promise.all(files.map(readAttachment));
      const next = [...attachments, ...added];
      checkTotalSize(next);
      setAttachments(next);
    } catch (e) {
      onNotice({ icon: "⚠️", title: "Can't attach", text: errorText(e) });
    }
  };

  const send = (text = input) => {
    const t = text.trim();
    if (!t && attachments.length === 0) return;
    onFirstSend();
    const parts: UIMessage["parts"] = attachments.map((a) => a.part);
    if (t) parts.push({ type: "text", text: t });
    setInput("");
    setAttachments([]);
    follow();
    if (busy) queued.enqueue(parts);
    else submit(parts);
  };

  return (
    <>
      <main className="scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="column">
          {messages.length === 0 ? (
            <EmptyState user={user} onSuggestion={send} />
          ) : (
            <MessageList
              messages={messages}
              busy={busy}
              waiting={waiting}
              toolLabels={toolLabels}
              onApproval={(id, approved) =>
                void addToolApprovalResponse({ id, approved })
              }
            />
          )}
          <div className="h-4" />
        </div>
        {away && (
          <div className="to-bottom">
            <button
              className="to-bottom-btn"
              onClick={follow}
              aria-label="Scroll to latest"
            >
              <ArrowDown />
            </button>
          </div>
        )}
      </main>

      <ResearchList jobs={research} />
      <QueuedList queue={queued.queue} onRemove={queued.remove} />
      <Composer
        value={input}
        busy={busy}
        attachments={attachments}
        onChange={setInput}
        onAttach={(files) => void attach(files)}
        onError={(text) => onNotice({ icon: "⚠️", title: "Voice input", text })}
        onRemoveAttachment={(i) =>
          setAttachments(attachments.filter((_, j) => j !== i))
        }
        onSend={() => send()}
        onStop={() => void stop()}
      />
    </>
  );
}
