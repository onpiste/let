import { useState, type FormEvent } from "react";

import type { JobInfo, NewJob } from "@cot/shared";

import { errorText } from "../../lib/errors";
import { localCron, WEEKDAYS, type Repeat } from "../../lib/schedule";

/** Creates a reminder or a task. Times are entered in local time. */
export function JobForm({
  onCreate
}: {
  onCreate: (job: NewJob) => Promise<unknown>;
}) {
  const [kind, setKind] = useState<JobInfo["kind"]>("task");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [repeat, setRepeat] = useState<Repeat>("daily");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [cron, setCron] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const when = (): NewJob["when"] => {
    switch (repeat) {
      case "once":
        return { type: "date", date: new Date(date).toISOString() };
      case "daily":
        return { type: "cron", cron: localCron(time, null) };
      case "weekdays":
        return { type: "cron", cron: localCron(time, [1, 2, 3, 4, 5]) };
      case "weekly":
        return { type: "cron", cron: localCron(time, [weekday]) };
      case "cron":
        return { type: "cron", cron };
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (repeat === "once" && !(new Date(date).getTime() > Date.now())) {
      setError("Pick a time in the future.");
      return;
    }
    setBusy(true);
    try {
      await onCreate({
        description,
        ...(kind === "task" && { prompt }),
        when: when()
      });
      setDescription("");
      setPrompt("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const atTime =
    repeat === "daily" || repeat === "weekdays" || repeat === "weekly";

  return (
    <form className="job-form" onSubmit={(e) => void submit(e)}>
      <h3>New</h3>
      <label>
        <span>Type</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as JobInfo["kind"])}
        >
          <option value="task">Task — the assistant does something</option>
          <option value="reminder">Reminder — just notify me</option>
        </select>
      </label>
      <label>
        <span>{kind === "task" ? "Name" : "Remind me to"}</span>
        <input
          required
          maxLength={200}
          value={description}
          placeholder={
            kind === "task" ? "Morning news digest" : "Stand up and stretch"
          }
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {kind === "task" && (
        <label>
          <span>Instruction</span>
          <textarea
            required
            rows={3}
            maxLength={4000}
            value={prompt}
            placeholder="Search the web for today’s top tech news and give me five bullet points with links."
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
      )}
      <label>
        <span>When</span>
        <select
          value={repeat}
          onChange={(e) => setRepeat(e.target.value as Repeat)}
        >
          <option value="once">Once</option>
          <option value="daily">Every day</option>
          <option value="weekdays">Every weekday</option>
          <option value="weekly">Every week</option>
          <option value="cron">Custom (cron, UTC)</option>
        </select>
      </label>
      {repeat === "once" && (
        <label>
          <span>Date and time</span>
          <input
            required
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      )}
      {repeat === "weekly" && (
        <label>
          <span>Day</span>
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
          >
            {WEEKDAYS.map((day, i) => (
              <option key={day} value={i}>
                {day}
              </option>
            ))}
          </select>
        </label>
      )}
      {atTime && (
        <label>
          <span>Time (your local time)</span>
          <input
            required
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      )}
      {repeat === "cron" && (
        <label>
          <span>Cron expression (UTC)</span>
          <input
            required
            value={cron}
            placeholder="0 1 * * 1-5"
            onChange={(e) => setCron(e.target.value)}
          />
        </label>
      )}
      <div className="actions">
        {error && <span className="error">{error}</span>}
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? "Scheduling…" : "Schedule"}
        </button>
      </div>
    </form>
  );
}
