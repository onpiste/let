import type { TaskSchedule } from "@cot/shared";

/** A short, human-readable schedule for the Tasks page. */
export function describeSchedule(schedule: TaskSchedule) {
  switch (schedule.kind) {
    case "once":
      return `Once, ${new Date(schedule.at).toLocaleString()}`;
    case "cron":
      return `Repeats (${schedule.cron})`;
    case "interval": {
      const minutes = Math.round(schedule.seconds / 60);
      return minutes >= 1 && schedule.seconds % 60 === 0
        ? `Every ${minutes} min`
        : `Every ${schedule.seconds} s`;
    }
  }
}
