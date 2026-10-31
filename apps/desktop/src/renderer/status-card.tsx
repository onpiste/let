import { useState } from "react";

import type { DesktopState } from "../shared/api";
import { attempt } from "./use-desktop";

function tunnelText(state: DesktopState): string {
  const { tunnel } = state;
  if (tunnel.status === "up") return `Online at ${tunnel.url}`;
  if (tunnel.status === "error") return `Problem: ${tunnel.error}`;
  return tunnel.status === "starting"
    ? "Starting (the first run downloads cloudflared)…"
    : "Off";
}

function linkText(state: DesktopState): string {
  const { link } = state;
  if (state.needsSignIn) return "Sign in to connect.";
  if (link.status === "registered")
    return "Registered in Cot: the tools are available in every chat.";
  if (link.status === "registering") return "Registering with Cot…";
  if (link.status === "error") return `Could not register: ${link.error}`;
  return "Waiting for the tunnel.";
}

export function StatusCard({ state }: { state: DesktopState }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <section className="card">
      <h2>Connection</h2>
      <p>Tunnel: {tunnelText(state)}</p>
      <p>{linkText(state)}</p>
      <div className="row">
        <button
          type="button"
          disabled={state.tunnel.status !== "up"}
          onClick={() =>
            void attempt(async () => {
              await window.cot.copyMcpUrl();
              setMessage(
                "Copied. Paste it under Settings → MCP servers in Cot if you add it by hand."
              );
            }, setMessage)
          }
        >
          Copy MCP URL
        </button>
        <button
          type="button"
          disabled={state.needsSignIn}
          onClick={() =>
            void attempt(() => window.cot.rotateSecret(), setMessage)
          }
        >
          Rotate secret
        </button>
      </div>
      <p className="muted small">
        The URL contains a secret: anyone who has it can use this computer as
        you. Rotating the secret replaces it in Cot automatically.
      </p>
      {message && <p className="small">{message}</p>}
    </section>
  );
}
