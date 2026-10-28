import { useAgentChat } from "@cloudflare/think/react";
import type { MCPServersState } from "agents";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";

import { ASSISTANT, type ServerEvent, type User } from "@cot/shared";

import { Brand } from "../../components/brand";
import { Calendar, Clock, Gear, LogOut, Plus } from "../../components/icons";
import { ThemeToggle } from "../../components/theme-toggle";
import { api } from "../../lib/assistant-rpc";
import {
  checkTotalSize,
  readAttachment,
  type Attachment
} from "../../lib/attachments";
import { errorText } from "../../lib/errors";
import { notify, requestNotificationPermission } from "../../lib/notifications";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { HistoryPanel } from "./history-panel";
import { MessageList } from "./message-list";
import { NoticeToast, type Notice } from "./notice-toast";
import { mcpToolLabels } from "./tool-chip";
import { useReconnectOnResume } from "./use-reconnect";

export function ChatPage({
  user,
  draft,
  onSignOut,
  onAuthCheck,
  onOpenSettings,
  onOpenTasks
}: {
  user: User;
  /** Text to start the message box with. */
  draft: string;
  onSignOut: () => void;
  onAuthCheck: () => void;
  onOpenSettings: () => void;
  onOpenTasks: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState(draft);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toast, setToast] = useState<Notice | null>(null);
  const [mcpLabels, setMcpLabels] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({
    agent: ASSISTANT.agent,
    basePath: ASSISTANT.basePath,
    // A cold Durable Object can take longer than the default timeout to
    // accept the first socket; retry quickly instead of backing off.
    connectionTimeout: 10_000,
    maxReconnectionDelay: 3_000,
    onOpen: useCallback(() => setConnected(true), []),
    onMcpUpdate: useCallback(
      (state: MCPServersState) => setMcpLabels(mcpToolLabels(state)),
      []
    ),
    onClose: useCallback(() => {
      setConnected(false);
      // A closed socket may mean the session expired.
      onAuthCheck();
    }, [onAuthCheck]),
    onMessage: useCallback((message: MessageEvent) => {
      try {
        const data = JSON.parse(String(message.data)) as Partial<ServerEvent>;
        if (data.type === "reminder" && data.description) {
          setToast({ icon: "⏰", title: "Reminder", text: data.description });
          notify("Cot reminder", data.description);
        }
        // Spam the assistant sorted out stays in the inbox without a toast.
        if (
          data.type === "email" &&
          data.subject &&
          data.category !== "ignore"
        ) {
          const from = data.from ?? "Someone";
          const sender =
            data.trusted === false ? `${from} (unknown sender)` : from;
          const text = `${sender}: ${data.summary ?? data.subject}`;
          const action = data.category === "action";
          setToast({
            icon: action ? "⚠️" : "📧",
            title: action ? "Email needs action" : "New email",
            text
          });
          notify(action ? "Cot: email needs action" : "Cot: new email", text);
        }
      } catch {
        // Not JSON — ignore.
      }
    }, [])
  });

  useReconnectOnResume(agent);

  const { messages, sendMessage, stop, status, addToolApprovalResponse } =
    useAgentChat({
      agent,
      experimental_throttle: 50
    });

  const busy = status === "streaming" || status === "submitted";
  const last = messages[messages.length - 1];
  const waiting = busy && (!last || last.role === "user");
  const empty = messages.length === 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, waiting]);

  const dismissToast = useCallback(() => setToast(null), []);

  const attach = async (files: File[]) => {
    try {
      const added = await Promise.all(files.map(readAttachment));
      const next = [...attachments, ...added];
      checkTotalSize(next);
      setAttachments(next);
    } catch (e) {
      setToast({ icon: "⚠️", title: "Can't attach", text: errorText(e) });
    }
  };

  const send = (text = input) => {
    const t = text.trim();
    if ((!t && attachments.length === 0) || busy) return;
    requestNotificationPermission();
    const parts: UIMessage["parts"] = attachments.map((a) => a.part);
    if (t) parts.push({ type: "text", text: t });
    setInput("");
    setAttachments([]);
    void sendMessage({ role: "user", parts });
  };

  return (
    <div className="app">
      <header className="topbar">
        <Brand>
          <span
            className={`status ${connected ? "on" : "off"}`}
            title={connected ? "Connected" : "Reconnecting…"}
          />
        </Brand>
        <div className="flex items-center gap-1">
          <button
            className="icon-btn"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-label="History"
            title="History"
          >
            <Clock />
          </button>
          {!empty && (
            <button
              className="icon-btn"
              onClick={() =>
                void api(agent)
                  .newChat()
                  .catch((e: unknown) =>
                    setToast({
                      icon: "⚠️",
                      title: "Can't start a new chat",
                      text: errorText(e)
                    })
                  )
              }
              aria-label="New chat"
              title="New chat"
            >
              <Plus />
            </button>
          )}
          <ThemeToggle />
          <button
            className="icon-btn"
            onClick={onOpenTasks}
            aria-label="Tasks"
            title="Tasks"
          >
            <Calendar />
          </button>
          <button
            className="icon-btn"
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings"
          >
            <Gear />
          </button>
          <button
            className="icon-btn"
            onClick={onSignOut}
            aria-label="Sign out"
            title={`Sign out ${user.email}`}
          >
            <LogOut />
          </button>
        </div>
      </header>

      {historyOpen && (
        <HistoryPanel agent={agent} onClose={() => setHistoryOpen(false)} />
      )}

      <main className="scroll">
        <div className="column">
          {empty ? (
            <EmptyState user={user} onSuggestion={send} />
          ) : (
            <MessageList
              messages={messages}
              busy={busy}
              waiting={waiting}
              toolLabels={mcpLabels}
              onApproval={(id, approved) =>
                void addToolApprovalResponse({ id, approved })
              }
            />
          )}
          <div ref={endRef} className="h-4" />
        </div>
      </main>

      <Composer
        value={input}
        busy={busy}
        attachments={attachments}
        onChange={setInput}
        onAttach={(files) => void attach(files)}
        onRemoveAttachment={(i) =>
          setAttachments(attachments.filter((_, j) => j !== i))
        }
        onSend={() => send()}
        onStop={() => void stop()}
      />

      {toast && <NoticeToast notice={toast} onDismiss={dismissToast} />}
    </div>
  );
}
