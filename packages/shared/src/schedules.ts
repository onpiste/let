/**
 * Scheduled jobs. A job is a reminder (the user is notified at that time)
 * or, when it has a prompt, a task: the Think assistant carries out the
 * prompt at that time and sends the user its reply.
 */

/** A scheduled job as the model and the settings page see it. */
export type JobInfo = {
  id: string;
  kind: "reminder" | "task";
  description: string;
  /** The instruction a task carries out. Absent for a reminder. */
  prompt?: string;
  /** The cron expression (UTC) of a repeating job. */
  cron?: string;
  /** ISO time of the next run. */
  nextRun: string;
  /**
   * Which assistant holds the schedule. New jobs all live in the Think
   * assistant; "pi" marks a reminder the Pi assistant scheduled earlier.
   */
  owner: "think" | "pi";
};

/** What a client sends to schedule a job. */
export type NewJob = {
  description: string;
  /** Set for a task, left out for a reminder. */
  prompt?: string;
  when:
    | { type: "date"; /** ISO date-time */ date: string }
    | { type: "cron"; /** UTC */ cron: string };
};
