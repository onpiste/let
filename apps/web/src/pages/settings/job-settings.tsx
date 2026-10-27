import { useCallback, useEffect, useState } from "react";

import type { JobInfo, NewJob } from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";
import { formatRun } from "../../lib/schedule";
import { JobForm } from "./job-form";

/** Scheduled reminders and tasks: list, cancel, create. */
export function JobSettings({
  agent,
  epoch
}: {
  agent: AgentHandle;
  /** Bumps on every (re)connect. */
  epoch: number;
}) {
  const [jobs, setJobs] = useState<JobInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api(agent)
      .listJobs()
      .then(setJobs)
      .catch((e: unknown) => setError(errorText(e)));
  }, [agent]);

  useEffect(() => {
    if (epoch === 0) return;
    refresh();
    // Jobs also change from the chat, and one-off jobs go once they run.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh, epoch]);

  const create = async (job: NewJob) => {
    await api(agent).createJob(job);
    refresh();
  };

  const cancel = async (job: JobInfo) => {
    if (!confirm(`Cancel “${job.description}”?`)) return;
    setError(null);
    try {
      await api(agent).cancelJob(job.id);
      refresh();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <section className="card">
      <h2>Scheduled</h2>
      <p className="muted">
        A reminder just notifies you. A task runs its instruction in your Think
        chat at that time and sends you the reply, here and on Telegram. You can
        also schedule from the chat: “every weekday at 8, summarize the news for
        me”.
      </p>
      {jobs === null ? (
        <p className="muted">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="muted">Nothing scheduled yet.</p>
      ) : (
        <ul className="list">
          {jobs.map((job) => (
            <li key={job.id}>
              <div>
                <div className="font-medium">{job.description}</div>
                {job.prompt && (
                  <div className="muted small clamp">{job.prompt}</div>
                )}
                <div className="small">
                  <span
                    className={`pill ${job.kind === "task" ? "ready" : ""}`}
                  >
                    {job.kind}
                  </span>{" "}
                  <span className="muted">
                    {job.cron ? "Next" : "At"} {formatRun(job.nextRun)}
                    {job.cron && (
                      <>
                        {" · repeats ("}
                        <code>{job.cron}</code>
                        {" UTC)"}
                      </>
                    )}
                    {job.owner === "pi" && " · set in Pi"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="link-btn"
                onClick={() => void cancel(job)}
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
      <JobForm onCreate={create} />
    </section>
  );
}
