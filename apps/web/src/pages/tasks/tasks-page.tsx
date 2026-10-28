import { useAgent } from "agents/react";
import { useCallback, useEffect, useState } from "react";

import { ASSISTANT, type ScheduledTask } from "@cot/shared";

import { api } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";
import { describeSchedule } from "../../lib/tasks";

/**
 * Every scheduled task, with pause / resume / delete buttons. Changing a
 * task's text or time is done in words: "Edit" opens the chat with a draft.
 */
export function TasksPage({
  onBack,
  onEditInChat
}: {
  onBack: () => void;
  onEditInChat: (draft: string) => void;
}) {
  const [tasks, setTasks] = useState<ScheduledTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const agent = useAgent({
    agent: ASSISTANT.agent,
    basePath: ASSISTANT.basePath,
    onOpen: useCallback(() => setEpoch((n) => n + 1), [])
  });

  useEffect(() => {
    if (epoch === 0) return;
    api(agent)
      .listTasks()
      .then(setTasks)
      .catch((e: unknown) => setError(errorText(e)));
  }, [agent, epoch]);

  const run = async (action: Promise<ScheduledTask[]>) => {
    try {
      setTasks(await action);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="flex items-center gap-2">
          <button className="back-btn" onClick={onBack}>
            ← Back
          </button>
          <span className="font-semibold tracking-tight">Tasks</span>
        </div>
      </header>
      <main className="scroll">
        <div className="column settings">
          <p className="muted">
            Reminders and recurring tasks. To change one, press Edit and say
            what you want, e.g. “move it to 9am”.
          </p>
          {error && <p className="error">{error}</p>}
          {!tasks && !error && <p className="muted">Loading…</p>}
          {tasks?.length === 0 && <p className="muted">No tasks yet.</p>}
          {tasks?.map((task) => (
            <section
              className={`card task ${task.paused ? "paused" : ""}`}
              key={task.id}
            >
              <strong>{task.description}</strong>
              <span className="muted">
                {describeSchedule(task.schedule)}
                {task.paused
                  ? " · Paused"
                  : task.nextRun
                    ? ` · Next ${new Date(task.nextRun).toLocaleString()}`
                    : ""}
              </span>
              <div className="actions">
                <button
                  className="link-btn"
                  onClick={() =>
                    onEditInChat(
                      `Change the task "${task.description}" (id ${task.id}): `
                    )
                  }
                >
                  Edit
                </button>
                <button
                  className="link-btn"
                  onClick={() =>
                    void run(
                      task.paused
                        ? api(agent).resumeTask(task.id)
                        : api(agent).pauseTask(task.id)
                    )
                  }
                >
                  {task.paused ? "Resume" : "Pause"}
                </button>
                <button
                  className="link-btn"
                  onClick={() => {
                    if (confirm("Delete this task?")) {
                      void run(api(agent).deleteTask(task.id));
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
