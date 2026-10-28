/** When a scheduled task runs. */
export type TaskSchedule =
  | { kind: "once"; /** ISO timestamp. */ at: string }
  | { kind: "cron"; cron: string }
  | { kind: "interval"; seconds: number };

/** A scheduled task (reminder), shown on the Tasks page. */
export type ScheduledTask = {
  id: string;
  description: string;
  schedule: TaskSchedule;
  /** ISO timestamp of the next run; null while paused. */
  nextRun: string | null;
  paused: boolean;
};
