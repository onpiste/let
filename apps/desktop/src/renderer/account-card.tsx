import { useState } from "react";

import type { DesktopState } from "../shared/api";
import { attempt } from "./use-desktop";

export function AccountCard({ state }: { state: DesktopState }) {
  const [origin, setOrigin] = useState(state.origin);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    await attempt(work, setError);
    setBusy(false);
  };

  return (
    <section className="card">
      <h2>Cot account</h2>
      {state.user && !state.needsSignIn ? (
        <p>
          Signed in as <strong>{state.user.email}</strong>.{" "}
          <button
            type="button"
            onClick={() => void run(() => window.cot.signOut())}
          >
            Sign out
          </button>
        </p>
      ) : (
        <>
          <label>
            Cot address
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} />
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await window.cot.setOrigin(origin);
                await window.cot.signIn();
              })
            }
          >
            {busy
              ? "Waiting for the browser…"
              : state.needsSignIn && state.user
                ? "Sign in again"
                : "Sign in with Google"}
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
