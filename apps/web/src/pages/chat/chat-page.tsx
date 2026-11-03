import type { MCPServersState } from "agents";
import { useAgent } from "agents/react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { ASSISTANT, type ServerEvent, type User } from "@cot/shared";

import {
  Calendar,
  Clock,
  Gear,
  LogOut,
  Mail,
  Plus
} from "../../components/icons";
import { ThemeToggle } from "../../components/theme-toggle";
import { api } from "../../lib/assistant-rpc";
import { loadChatCache } from "../../lib/chat-cache";
import { devLog } from "../../lib/dev-log";
import { errorText } from "../../lib/errors";
import { notify, requestNotificationPermission } from "../../lib/notifications";
import { setUpWebPush } from "../../lib/web-push";
import { ChatLoading } from "./chat-loading";
import { ChatPane } from "./chat-pane";
import { HistoryPanel } from "./history-panel";
import { NoticeToast, type Notice } from "./notice-toast";
import { mcpToolLabels } from "./tool-chip";
import { useReconnectOnResume } from "./use-reconnect";
import { useResearchJobs } from "./use-research-jobs";
import { useUnreadEmails } from "./use-unread-emails";

export function ChatPage({
  user,
  draft,
  onSignOut,
  onAuthCheck,
  onOpenSettings,
  onOpenTasks,
  onOpenEmail
}: {
  user: User;
  /** Text to start the message box with. */
  draft: string;
  onSignOut: () => void;
  onAuthCheck: () => void;
  onOpenSettings: () => void;
  onOpenTasks: () => void;
  /** The inbox, with one email open or (null) the list. */
  onOpenEmail: (id: number | null) => void;
}) {
  const [connected, setConnected] = useState(false);
  // The open chat: the cached one at once, then the server's choice.
  const [chatId, setChatId] = useState(
    () => loadChatCache(user.id)?.chatId ?? null
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toast, setToast] = useState<Notice | null>(null);
  // Every warning the user sees is also a log line, so a report like "it
  // said X" can be found later.
  useEffect(() => {
    if (toast?.icon === "⚠️") {
      devLog.warn("notice", toast.title, { text: toast.text });
    }
  }, [toast]);
  const [mcpLabels, setMcpLabels] = useState<Record<string, string>>({});
  const research = useResearchJobs();
  const { onEvent: onResearchEvent, load: loadResearch } = research;
  const emails = useUnreadEmails();
  const { onEvent: onEmailEvent, load: loadUnread } = emails;

  const agent = useAgent({
    agent: ASSISTANT.agent,
    basePath: ASSISTANT.basePath,
    // A cold Durable Object can take longer than the default timeout to
    // accept the first socket; retry quickly instead of backing off.
    connectionTimeout: 10_000,
    maxReconnectionDelay: 3_000,
    onOpen: useCallback(() => {
      devLog.info("socket", "Assistant socket open");
      setConnected(true);
    }, []),
    onMcpUpdate: useCallback(
      (state: MCPServersState) => setMcpLabels(mcpToolLabels(state)),
      []
    ),
    onClose: useCallback(
      (event: CloseEvent) => {
        devLog.info("socket", "Assistant socket closed", {
          code: event.code,
          reason: event.reason
        });
        setConnected(false);
        // A closed socket may mean the session expired.
        onAuthCheck();
      },
      [onAuthCheck]
    ),
    onMessage: useCallback(
      (message: MessageEvent) => {
        try {
          const data = JSON.parse(String(message.data)) as Partial<ServerEvent>;
          onResearchEvent(data);
          onEmailEvent(data);
          if (data.type === "reminder" && data.description) {
            setToast({ icon: "⏰", title: "Reminder", text: data.description });
            notify("Cot reminder", data.description);
          }
          if (data.type === "research" && data.topic) {
            const title = data.ok ? "Research ready" : "Research failed";
            setToast({ icon: "🔎", title, text: data.topic });
            notify(`Cot: ${title.toLowerCase()}`, data.topic);
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
              text,
              emailId: typeof data.id === "number" ? data.id : undefined
            });
            notify(action ? "Cot: email needs action" : "Cot: new email", text);
          }
        } catch {
          // Not JSON — ignore.
        }
      },
      [onResearchEvent, onEmailEvent]
    )
  });

  useReconnectOnResume(agent);

  const setUpPush = useCallback(() => {
    setUpWebPush(api(agent)).catch((error: unknown) =>
      console.warn(`Web Push setup failed: ${String(error)}`)
    );
  }, [agent]);

  // Every connection re-registers this browser, like the iOS app does.
  useEffect(() => {
    if (!connected) return;
    setUpPush();
    loadResearch(api(agent));
    loadUnread(api(agent));
  }, [connected, setUpPush, loadResearch, loadUnread, agent]);

  // On the first connection, open the chat last used on any device.
  const askedCurrent = useRef(false);
  const openCurrent = useCallback(() => {
    api(agent)
      .currentChat()
      .then(setChatId)
      .catch((e: unknown) =>
        setToast({ icon: "⚠️", title: "Can't open chat", text: errorText(e) })
      );
  }, [agent]);
  useEffect(() => {
    if (!connected || askedCurrent.current) return;
    askedCurrent.current = true;
    openCurrent();
  }, [connected, openCurrent]);

  const startNewChat = () =>
    void api(agent)
      .newChat()
      .then(setChatId)
      .catch((e: unknown) =>
        setToast({
          icon: "⚠️",
          title: "Can't start a new chat",
          text: errorText(e)
        })
      );

  const dismissToast = useCallback(() => setToast(null), []);
  const askForNotifications = useCallback(
    () => requestNotificationPermission(setUpPush),
    [setUpPush]
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="flex items-center gap-1">
          <button
            className="icon-btn"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-label="History"
            title="History"
          >
            <Clock />
          </button>
          <span
            className={`status ${connected ? "on" : "off"}`}
            title={connected ? "Connected" : "Reconnecting…"}
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            className="icon-btn"
            onClick={startNewChat}
            aria-label="New chat"
            title="New chat"
          >
            <Plus />
          </button>
          <ThemeToggle />
          <button
            className="icon-btn badge-host"
            onClick={() => onOpenEmail(null)}
            aria-label={
              emails.unread > 0 ? `Inbox, ${emails.unread} unread` : "Inbox"
            }
            title="Inbox"
          >
            <Mail />
            {emails.unread > 0 && (
              <span className="badge">
                {emails.unread > 99 ? "99+" : emails.unread}
              </span>
            )}
          </button>
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
        <HistoryPanel
          agent={agent}
          currentId={chatId}
          onOpen={setChatId}
          onNew={startNewChat}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {chatId ? (
        // A chat not shown before loads its messages first: spin meanwhile
        // rather than show a blank page (ChatView.swift does the same).
        <Suspense key={chatId} fallback={<ChatLoading />}>
          <ChatPane
            user={user}
            chatId={chatId}
            draft={draft}
            research={research.jobs}
            toolLabels={mcpLabels}
            onNotice={setToast}
            onFirstSend={askForNotifications}
            onMissing={openCurrent}
          />
        </Suspense>
      ) : (
        <ChatLoading />
      )}

      {toast && (
        <NoticeToast
          notice={toast}
          onDismiss={dismissToast}
          onOpen={
            toast.emailId === undefined
              ? undefined
              : () => onOpenEmail(toast.emailId ?? null)
          }
        />
      )}
    </div>
  );
}
