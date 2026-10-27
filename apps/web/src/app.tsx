import { useCallback, useEffect, useState } from "react";

import type { HarnessId, User } from "@cot/shared";

import { fetchCurrentUser, signOut as requestSignOut } from "./lib/auth";
import { loadHarness, saveHarness } from "./lib/harness";
import { ChatPage } from "./pages/chat/chat-page";
import { SettingsPage } from "./pages/settings/settings-page";
import { SignInPage } from "./pages/sign-in-page";

// ── Routing ───────────────────────────────────────────────────────────
// Two pages, so a router library isn't worth it: the path picks the page
// and history.pushState keeps the back button working.

type Page = "chat" | "settings";

function currentPage(): Page {
  return location.pathname === "/settings" ? "settings" : "chat";
}

/** Session state and page switching; each page owns its own agent socket. */
export default function App() {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [harness, setHarness] = useState(loadHarness);
  const [page, setPage] = useState(currentPage);

  useEffect(() => {
    const onPop = () => setPage(currentPage());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to: Page) => {
    history.pushState(null, "", to === "settings" ? "/settings" : "/");
    setPage(to);
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

  const changeHarness = (h: HarnessId) => {
    setHarness(h);
    saveHarness(h);
  };

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
  // Remount on switch so the chat connects to the other agent cleanly.
  return (
    <ChatPage
      key={harness}
      user={user}
      harness={harness}
      onHarnessChange={changeHarness}
      onSignOut={() => void signOut()}
      onAuthCheck={refresh}
      onOpenSettings={() => navigate("settings")}
    />
  );
}
