import type { Agent, Schedule } from "agents";

import type { JobInfo, ServerEvent } from "@cot/shared";

/**
 * Scheduled jobs (see JobInfo in @cot/shared): what a schedule stores and
 * how both harnesses read it. The scheduling itself is plain Agents SDK.
 */
export type Job = { description: string; prompt?: string };

/** What a job schedule carries. Older reminders stored just the text. */
export type JobPayload = Job | string;

/** The schedule callback both assistants register jobs under. */
export const JOB_CALLBACK = "executeTask";

/** Metadata `source` of the Think submissions that scheduled tasks start. */
export const SCHEDULED_TASK_SOURCE = "scheduled-task";

export function toJob(payload: JobPayload): Job {
  return typeof payload === "string" ? { description: payload } : payload;
}

/** Leaves out the SDK's and Think's own schedules. */
function isJobSchedule(schedule: Schedule<unknown>) {
  return schedule.callback === JOB_CALLBACK;
}

export function toJobInfo(
  schedule: Schedule<unknown>,
  owner: JobInfo["owner"]
): JobInfo {
  // Trust boundary: only JOB_CALLBACK schedules reach here, and those are
  // only ever created with a JobPayload.
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

/** An agent's own job schedules. */
export async function listOwnJobs(agent: Agent<Env>, owner: JobInfo["owner"]) {
  return (await agent.listSchedules())
    .filter(isJobSchedule)
    .map((s) => toJobInfo(s, owner));
}

/** Cancels a job schedule; never touches the SDK's own schedules. */
export async function cancelOwnJob(agent: Agent<Env>, id: string) {
  const schedule = await agent.getScheduleById(id);
  return Boolean(
    schedule && isJobSchedule(schedule) && (await agent.cancelSchedule(id))
  );
}

/**
 * Shows an event in the agent's open chats. Broadcast instead of saving a
 * message so it doesn't enter the chat history and trigger a model turn.
 */
export function broadcastEvent(agent: Agent<Env>, event: ServerEvent) {
  agent.broadcast(JSON.stringify(event));
}
