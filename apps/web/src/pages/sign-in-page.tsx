import { AUTH_ROUTES } from "@cot/shared";

import { Brand } from "../components/brand";
import { ThemeToggle } from "../components/theme-toggle";
import { greeting } from "../lib/greeting";

export function SignInPage({ message }: { message?: string }) {
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
            {message && <p className="hero-sub">{message}</p>}
            <a className="signin-btn" href={AUTH_ROUTES.login}>
              Sign in with Google
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
