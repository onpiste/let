import { useState } from "react";

import type { DesktopState, Policy } from "../shared/api";
import { attempt } from "./use-desktop";

const CALENDARS: [Policy["calendar"], string][] = [
  ["auto", "Automatic for this system"],
  ["macos", "macOS Calendar and Reminders"],
  ["outlook", "Windows Outlook"],
  ["ics", "An .ics file"],
  ["khal", "khal (Linux)"]
];

export function AccessCard({ state }: { state: DesktopState }) {
  const { policy } = state;
  const [error, setError] = useState<string | null>(null);
  const save = (patch: Partial<Policy>) =>
    void attempt(() => window.cot.setPolicy(patch), setError);

  const addFolder = () =>
    void attempt(async () => {
      const folder = await window.cot.pickFolder();
      if (folder && !policy.roots.includes(folder)) {
        await window.cot.setPolicy({ roots: [...policy.roots, folder] });
      }
    }, setError);

  return (
    <section className="card">
      <h2>What the assistant may do</h2>
      <h3>Folders it can read and write</h3>
      <ul className="list">
        {policy.roots.map((root) => (
          <li key={root}>
            <code>{root}</code>
            <button
              type="button"
              disabled={policy.roots.length === 1}
              onClick={() =>
                save({ roots: policy.roots.filter((r) => r !== root) })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={addFolder}>
        Add folder…
      </button>
      <label className="check">
        <input
          type="checkbox"
          checked={policy.allowShell}
          onChange={(e) => save({ allowShell: e.target.checked })}
        />
        Run commands (ffmpeg, git, any program you have installed)
      </label>
      <p className="muted small">
        Commands and coding agents can touch anything your user account can, not
        just the folders above. Turn commands off to keep only files and
        calendar.
      </p>
      <label>
        Calendar
        <select
          value={policy.calendar}
          onChange={(e) =>
            save({ calendar: e.target.value as Policy["calendar"] })
          }
        >
          {CALENDARS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
