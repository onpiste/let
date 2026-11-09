import { useCallback, useEffect, useState } from "react";

import { emailIdFromPath, inboxPath, type User } from "@cot/shared";

import { fetchCurrentUser, signOut as requestSignOut } from "./lib/auth";
import { ChatPage } from "./pages/chat/chat-page";
import { InboxPage } from "./pages/inbox/inbox-page";
import { SettingsPage } from "./pages/settings/settings-page";
import { SignInPage } from "./pages/sign-in-page";
import { TasksPage } from "./pages/tasks/tasks-page";

// ── Routing ───────────────────────────────────────────────────────────
// A few pages, so a router library isn't worth it: the path picks the page
// and history.pushState keeps the back button working. `/inbox/12` opens
// one email; push alerts for new mail link there (sw.js).

type Page = "chat" | "settings" | "tasks" | "inbox";

function currentPage(): Page {
  const path = location.pathname;
  if (path === "/settings") return "settings";
  if (path === "/tasks") return "tasks";
  if (path === inboxPath() || emailIdFromPath(path) !== null) return "inbox";
  return "chat";
}

/** Session state and page switching; each page owns its own agent socket. */
export default function App() {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(currentPage);
  const [emailId, setEmailId] = useState(() =>
    emailIdFromPath(location.pathname)
  );
  // Text to put in the chat box, e.g. from the Tasks page's Edit button.
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const onPop = () => {
      setPage(currentPage());
      setEmailId(emailIdFromPath(location.pathname));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to: Page) => {
    history.pushState(null, "", to === "chat" ? "/" : `/${to}`);
    setPage(to);
    setEmailId(null);
  };

  /** The inbox with one email open, or the list for null. */
  const openEmail = (id: number | null) => {
    history.pushState(null, "", inboxPath(id ?? undefined));
    setPage("inbox");
    setEmailId(id);
  };

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
    await requestSignOut();
    setUser(null);
  };

  if (error) return <SignInPage message={error} />;
  if (user === undefined) return <div className="app" />;
  if (user === null) return <SignInPage />;
  if (page === "settings") {
    return <SettingsPage user={user} onBack={() => navigate("chat")} />;
  }
  if (page === "inbox") {
    return (
      <InboxPage
        emailId={emailId}
        onOpen={openEmail}
        onBack={() => navigate("chat")}
        onChat={() => navigate("chat")}
      />
    );
  }
  if (page === "tasks") {
    return (
      <TasksPage
        onBack={() => navigate("chat")}
        onEditInChat={(text) => {
          setDraft(text);
          navigate("chat");
        }}
      />
    );
  }
  return (
    <ChatPage
      user={user}
      draft={draft}
      onSignOut={() => void signOut()}
      onAuthCheck={refresh}
      onOpenSettings={() => navigate("settings")}
      onOpenTasks={() => navigate("tasks")}
      onOpenEmail={openEmail}
    />
  );
}
