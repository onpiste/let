import { useState } from "react";

import type { DesktopState } from "../shared/api";
import { attempt } from "./use-desktop";

/** Optional: a named Cloudflare tunnel keeps the same address across restarts. */
export function TunnelCard({ state }: { state: DesktopState }) {
  const [host, setHost] = useState(state.tunnelHost);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card">
      <h2>Stable address (optional)</h2>
      <p className="muted small">
        By default a free Cloudflare quick tunnel is used and its address
        changes on every start; this app updates Cot each time. With your own
        named tunnel the address stays put.
      </p>
      <label>
        Tunnel hostname
        <input
          value={host}
          placeholder="bridge.example.com"
          onChange={(e) => setHost(e.target.value)}
        />
      </label>
      <label>
        Tunnel token {state.hasTunnelToken && "(saved)"}
        <input
          type="password"
          value={token}
          placeholder={state.hasTunnelToken ? "Leave empty to keep it" : "eyJ…"}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={() =>
          void attempt(async () => {
            await window.cot.setTunnel(host, token);
            setToken("");
          }, setError)
        }
      >
        Save and restart tunnel
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
