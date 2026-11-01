import { useEffect, useState } from "react";

import type { ResearchJob } from "@cot/shared";

function elapsed(startedAt: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - startedAt) / 60_000));
  return minutes < 1 ? "just started" : `${minutes} min`;
}

/**
 * Deep Research runs still going, above the composer, so a run that takes
 * minutes doesn't look stuck. Mirrors ResearchView.swift.
 */
export function ResearchList({ jobs }: { jobs: ResearchJob[] }) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (jobs.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [jobs.length]);

  if (jobs.length === 0) return null;
  return (
    <div className="research">
      {jobs.map((job) => (
        <div className="research-job" key={job.id} title={job.topic}>
          <div className="research-head">
            <span className={`dot ${job.problem ? "warn" : "pending"}`} />
            <span className="font-medium">Researching</span>
            <span className="truncate opacity-70">· {job.topic}</span>
            <span className="research-time">{elapsed(job.startedAt, now)}</span>
          </div>
          {(job.problem ?? job.progress) && (
            <div className={`research-note ${job.problem ? "warn" : ""}`}>
              {job.problem
                ? `Can't reach the run right now, retrying: ${job.problem}`
                : job.progress}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
