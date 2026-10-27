import type { Schedule } from "agents";

/**
 * Scheduled jobs, shared by both harnesses and the settings page. A job is a
 * reminder (the user is notified at that time) or, when it carries a prompt,
 * a task: the Think assistant runs a turn with the prompt and sends the user
 * the reply. Jobs live in the Think assistant; schedules made before that
 * may still sit in the Pi assistant, and are listed too.
 *
 * This module is imported by the client too, so it must not pull in
 * server-only code.
 */
export type Job = { description: string; prompt?: string };

/** What a schedule carries. Older reminders stored just the description. */
export type JobPayload = Job | string;

/** A scheduled job as the model and the settings page see it. */
export type JobInfo = {
  id: string;
  kind: "reminder" | "task";
  description: string;
  prompt?: string;
  /** The cron expression (UTC) of a repeating job. */
  cron?: string;
  /** ISO time of the next run. */
  nextRun: string;
  /** Which assistant holds the schedule. */
  owner: "think" | "pi";
};

/** What the settings page sends to create a job. */
export type NewJob = Job & {
  when: { type: "date"; date: string } | { type: "cron"; cron: string };
};

/** Broadcast to open chats when a job fires. */
export type JobNotice =
  | { type: "reminder"; description: string; timestamp: string }
  | {
      type: "task-result";
      description: string;
      ok: boolean;
      text: string;
      timestamp: string;
    };

/** The schedule callback both assistants register jobs under. */
export const JOB_CALLBACK = "executeTask";

/** Metadata `source` of the Think submissions that scheduled tasks start. */
export const SCHEDULED_TASK_SOURCE = "scheduled-task";

export function toJob(payload: JobPayload): Job {
  return typeof payload === "string" ? { description: payload } : payload;
}

export function isJobSchedule(schedule: Schedule<unknown>) {
  return schedule.callback === JOB_CALLBACK;
}

export function toJobInfo(
  schedule: Schedule<unknown>,
  owner: JobInfo["owner"]
): JobInfo {
  const job = toJob(schedule.payload as JobPayload);
  return {
    id: schedule.id,
    kind: job.prompt ? "task" : "reminder",
    description: job.description,
    ...(job.prompt && { prompt: job.prompt }),
    ...(schedule.type === "cron" && { cron: schedule.cron }),
    nextRun: new Date(schedule.time * 1000).toISOString(),
    owner
  };
}

export function byNextRun(a: JobInfo, b: JobInfo) {
  return a.nextRun.localeCompare(b.nextRun);
}

/**
 * Tells the model the user's local time, since schedules (cron included)
 * run in UTC. `timezone` is the IANA zone Cloudflare saw the user in.
 */
export function timeNote(timezone: string | null, now = new Date()) {
  const utc = `Current time: ${now.toUTCString()}.`;
  if (!timezone) return `${utc} Schedules, cron included, run in UTC.`;
  try {
    const local = now.toLocaleString("en-US", {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "short"
    });
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset"
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value;
    return `${utc} The user is in ${timezone} (${offset}), where it is ${local}. Schedules, cron included, run in UTC: convert the user's local times to UTC.`;
  } catch {
    return `${utc} Schedules, cron included, run in UTC.`;
  }
}

/** How the scheduling tools are explained to the model. */
export const SCHEDULE_TOOL_DESCRIPTION =
  "Schedule a reminder or a task. A reminder only notifies the user at that time. A task is something the user wants done at that time (look something up, summarize, check a page, write something): give `prompt`, the instruction you will carry out then, written so it makes sense on its own. The result is sent to the user in the app and on Telegram.";
