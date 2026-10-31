import type { DesktopState } from "../shared/api";

export function ActivityCard({ state }: { state: DesktopState }) {
  return (
    <section className="card">
      <h2>Recent activity</h2>
      {state.activity.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <ul className="list">
          {state.activity.map((entry) => (
            <li key={`${entry.time}-${entry.tool}-${entry.summary}`}>
              <span className={entry.ok ? "" : "error"}>
                {new Date(entry.time).toLocaleTimeString()} ·{" "}
                <strong>{entry.tool}</strong>
              </span>
              <code className="small">{entry.summary}</code>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
