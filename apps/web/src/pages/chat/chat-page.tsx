import { useAgentChat } from "@cloudflare/think/react";
import type { MCPServersState } from "agents";
import { useAgent } from "agents/react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  HARNESSES,
  type HarnessId as Harness,
  type ServerEvent,
  type User
} from "@cot/shared";

import { Brand } from "../../components/brand";
import { Gear, LogOut, Plus } from "../../components/icons";
import { ThemeToggle } from "../../components/theme-toggle";
import { tapFeedback } from "../../lib/native";
import { notify, requestNotificationPermission } from "../../lib/notifications";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { HarnessSwitch } from "./harness-switch";
import { MessageList } from "./message-list";
import { NoticeToast, type Notice } from "./notice-toast";
import { mcpToolLabels } from "./tool-chip";

export function ChatPage({
  user,
  harness,
  onHarnessChange,
  onSignOut,
  onAuthCheck,
  onOpenSettings
}: {
  user: User;
  harness: Harness;
  onHarnessChange: (h: Harness) => void;
  onSignOut: () => void;
  onAuthCheck: () => void;
  onOpenSettings: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState<Notice | null>(null);
  const [mcpLabels, setMcpLabels] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({
    agent: HARNESSES[harness].agent,
    basePath: HARNESSES[harness].basePath,
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
        if (data.type === "email" && data.subject) {
          const from = data.from ?? "Someone";
          const text = `${data.trusted === false ? `${from} (unknown sender)` : from}: ${data.subject}`;
          setToast({ icon: "📧", title: "New email", text });
          notify("Cot: new email", text);
        }
      } catch {
        // Not JSON — ignore.
      }
    }, [])
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    stop,
    status,
    addToolApprovalResponse
  } = useAgentChat({
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

  const send = (text = input) => {
    const t = text.trim();
    if (!t || busy) return;
    requestNotificationPermission();
    tapFeedback();
    setInput("");
    void sendMessage({ role: "user", parts: [{ type: "text", text: t }] });
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
          <HarnessSwitch value={harness} onChange={onHarnessChange} />
          {!empty && (
            <button
              className="icon-btn"
              onClick={clearHistory}
              aria-label="New chat"
              title="New chat"
            >
              <Plus />
            </button>
          )}
          <ThemeToggle />
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
        onChange={setInput}
        onSend={() => send()}
        onStop={() => void stop()}
      />

      {toast && <NoticeToast notice={toast} onDismiss={dismissToast} />}
    </div>
  );
}
