import { AccessCard } from "./access-card";
import { AccountCard } from "./account-card";
import { ActivityCard } from "./activity-card";
import { StatusCard } from "./status-card";
import { TunnelCard } from "./tunnel-card";
import { useDesktop } from "./use-desktop";

export function App() {
  const state = useDesktop();
  if (!state) return <main className="page">Loading…</main>;
  return (
    <main className="page">
      <h1>Cot Desktop</h1>
      <p className="muted">
        Lets your assistant use this computer: calendar, files and command-line
        tools. Everything below is decided here, never by the assistant.
      </p>
      <AccountCard state={state} />
      <StatusCard state={state} />
      <AccessCard state={state} />
      <TunnelCard state={state} />
      <ActivityCard state={state} />
    </main>
  );
}
