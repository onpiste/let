import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/think/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import type { User } from "./auth";
import type { Assistant } from "./server";

// ── Identity ──────────────────────────────────────────────────────────
// The Worker routes /chat to the signed-in user's own assistant instance.

async function fetchCurrentUser(): Promise<User | null> {
  const res = await fetch("/auth/me", {
    headers: { Accept: "application/json" }
  });
  if (res.status === 401) return null;
  if (!res.ok)
    throw new Error(`Failed to load the current user (${res.status})`);
  return (await res.json()) as User;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const SUGGESTIONS = [
  "帮我规划一下今天要做的事",
  "Remind me in 10 minutes to stretch",
  "我叫什么名字？你还记得我什么？",
  "Help me write a polite follow-up email"
];

// ── Icons (inline, no icon library) ───────────────────────────────────

const ArrowUp = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
const Square = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
);
const Plus = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Moon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const LogOut = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);
const Sun = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

// ── Small components ──────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );
  const toggle = () => {
    const mode = dark ? "light" : "dark";
    setDark(!dark);
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    try {
      localStorage.setItem("theme", mode);
    } catch {}
  };
  return (
    <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}

const TOOL_LABELS: Record<string, string> = {
  remember: "Saved to memory",
  forget: "Removed from memory",
  scheduleTask: "Reminder set",
  getScheduledTasks: "Checked reminders",
  cancelScheduledTask: "Reminder cancelled"
};

function ToolChip({ part }: { part: UIMessage["parts"][number] }) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const done = part.state === "output-available";
  const input = part.input as Record<string, unknown> | undefined;
  const detail =
    (input?.content as string) || (input?.description as string) || "";
  return (
    <div className="tool-chip">
      <span className={`dot ${done ? "done" : "pending"}`} />
      <span className="font-medium">{TOOL_LABELS[name] ?? name}</span>
      {detail && <span className="opacity-70 truncate">· {detail}</span>}
    </div>
  );
}

function Thinking({ text, streaming }: { text: string; streaming: boolean }) {
  if (!text.trim()) return null;
  return (
    <details className="thinking" open={streaming}>
      <summary>{streaming ? "Thinking…" : "Thought process"}</summary>
      <div className="whitespace-pre-wrap">{text}</div>
    </details>
  );
}

function TypingDots() {
  return (
    <div className="typing" aria-label="Assistant is typing">
      <span />
      <span />
      <span />
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────

export default function App() {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchCurrentUser()
      .then((u) => {
        setUser(u);
        setError(null);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(refresh, [refresh]);

  const signOut = async () => {
    await fetch("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  };

  if (error) return <SignIn message={error} />;
  if (user === undefined) return <div className="app" />;
  if (user === null) return <SignIn />;
  return <Chat user={user} onSignOut={signOut} onAuthCheck={refresh} />;
}

function SignIn({ message }: { message?: string }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="flex items-center gap-2">
          <div className="logo">C</div>
          <span className="font-semibold tracking-tight">Cot</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="scroll">
        <div className="column">
          <div className="hero">
            <h1 className="hero-title">{greeting()}</h1>
            <p className="hero-sub">
              I'm Cot, your personal assistant. Sign in to continue.
            </p>
            {message && <p className="hero-sub">{message}</p>}
            <a className="signin-btn" href="/auth/login">
              Sign in with Google
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

function Chat({
  user,
  onSignOut,
  onAuthCheck
}: {
  user: User;
  onSignOut: () => void;
  onAuthCheck: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const agent = useAgent<Assistant>({
    agent: "Assistant",
    basePath: "chat",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => {
      setConnected(false);
      // A closed socket may mean the session expired.
      onAuthCheck();
    }, [onAuthCheck]),
    onMessage: useCallback((message: MessageEvent) => {
      try {
        const data = JSON.parse(String(message.data));
        if (data.type === "reminder") {
          setToast(data.description);
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("Cot reminder", { body: data.description });
          }
        }
      } catch {
        // Not JSON — ignore.
      }
    }, [])
  });

  const { messages, sendMessage, clearHistory, stop, status } = useAgentChat({
    agent,
    experimental_throttle: 50
  });

  const busy = status === "streaming" || status === "submitted";
  const last = messages[messages.length - 1];
  const waiting = busy && (!last || last.role === "user");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, waiting]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const send = (text = input) => {
    const t = text.trim();
    if (!t || busy) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    setInput("");
    sendMessage({ role: "user", parts: [{ type: "text", text: t }] });
    requestAnimationFrame(() => {
      autosize();
      textareaRef.current?.focus();
    });
  };

  const empty = messages.length === 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="flex items-center gap-2">
          <div className="logo">C</div>
          <span className="font-semibold tracking-tight">Cot</span>
          <span
            className={`status ${connected ? "on" : "off"}`}
            title={connected ? "Connected" : "Reconnecting…"}
          />
        </div>
        <div className="flex items-center gap-1">
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
            <div className="hero">
              <h1 className="hero-title">
                {greeting()}, {user.name.split(" ")[0]}
              </h1>
              <p className="hero-sub">
                I'm Cot, your personal assistant. What's on your mind?
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="suggestion"
                    onClick={() => send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                if (m.role === "user") {
                  const text = m.parts
                    .filter((p) => p.type === "text")
                    .map((p) => (p as { text: string }).text)
                    .join("");
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="bubble-user">{text}</div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="assistant">
                    {m.parts.map((part, j) => {
                      if (part.type === "reasoning") {
                        return (
                          <Thinking
                            key={j}
                            text={part.text}
                            streaming={busy && isLast && part.state !== "done"}
                          />
                        );
                      }
                      if (part.type === "text") {
                        return (
                          <Streamdown
                            key={j}
                            className="prose-cot"
                            plugins={{ code }}
                            isAnimating={busy && isLast}
                          >
                            {part.text}
                          </Streamdown>
                        );
                      }
                      if (isToolUIPart(part))
                        return <ToolChip key={j} part={part} />;
                      return null;
                    })}
                  </div>
                );
              })}
              {waiting && <TypingDots />}
            </div>
          )}
          <div ref={endRef} className="h-4" />
        </div>
      </main>

      <footer className="composer-wrap">
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            placeholder="Message Cot…"
            onChange={(e) => {
              setInput(e.target.value);
              autosize();
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send();
              }
            }}
          />
          {busy ? (
            <button
              type="button"
              className="send-btn"
              onClick={stop}
              aria-label="Stop"
            >
              <Square />
            </button>
          ) : (
            <button
              type="submit"
              className="send-btn"
              disabled={!input.trim()}
              aria-label="Send"
            >
              <ArrowUp />
            </button>
          )}
        </form>
        <p className="hint">
          Cot remembers what you tell it. Built on Cloudflare Agents.
        </p>
      </footer>

      {toast && (
        <button
          type="button"
          className="toast"
          aria-live="polite"
          onClick={() => setToast(null)}
        >
          <span className="text-lg">⏰</span>
          <span className="text-left">
            <span className="block font-semibold text-sm">Reminder</span>
            <span className="block text-sm opacity-80">{toast}</span>
          </span>
        </button>
      )}
    </div>
  );
}
