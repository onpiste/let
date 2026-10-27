import { useState } from "react";

import { AUTH_ROUTES } from "@cot/shared";

import { Brand } from "../components/brand";
import { ThemeToggle } from "../components/theme-toggle";
import { errorText } from "../lib/errors";
import { greeting } from "../lib/greeting";
import { isNativeApp } from "../lib/native";
import { nativeSignIn } from "../lib/native-auth";

export function SignInPage({
  message,
  onSignedIn
}: {
  message?: string;
  onSignedIn: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  // The iOS app can't show Google sign-in in its WebView; see native-auth.ts.
  const signInNative = async () => {
    setError(null);
    try {
      await nativeSignIn();
      onSignedIn();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="scroll">
        <div className="column">
          <div className="hero">
            <h1 className="hero-title">{greeting()}</h1>
            <p className="hero-sub">
              I'm Cot, your personal assistant. Sign in to continue.
            </p>
            {(error ?? message) && (
              <p className="hero-sub">{error ?? message}</p>
            )}
            {isNativeApp ? (
              <button
                type="button"
                className="signin-btn"
                onClick={() => void signInNative()}
              >
                Sign in with Google
              </button>
            ) : (
              <a className="signin-btn" href={AUTH_ROUTES.login}>
                Sign in with Google
              </a>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
