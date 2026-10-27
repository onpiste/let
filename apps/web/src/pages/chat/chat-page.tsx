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
import { notify, requestNotificationPermission } from "../../lib/notifications";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { describeEvent, EventToast } from "./event-toast";
import { HarnessSwitch } from "./harness-switch";
import { MessageList } from "./message-list";
import { mcpToolLabels } from "./tool-chip";

/** A ServerEvent, or null for anything else (MCP and chat frames). */
function parseServerEvent(data: string): ServerEvent | null {
  // Untyped JSON from the socket; check the fields this page reads.
  const event = JSON.parse(data) as Partial<ServerEvent>;
  if (typeof event.description !== "string") return null;
  if (event.type === "reminder") return event as ServerEvent;
  if (event.type === "task-result" && typeof event.text === "string") {
    return event as ServerEvent;
  }
  return null;
}

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
  const [toast, setToast] = useState<ServerEvent | null>(null);
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
        const event = parseServerEvent(String(message.data));
        if (!event) return;
        setToast(event);
        const { title, body } = describeEvent(event);
        notify(`Cot · ${title}`, body.slice(0, 200));
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

      {toast && <EventToast event={toast} onDismiss={dismissToast} />}
    </div>
  );
}
