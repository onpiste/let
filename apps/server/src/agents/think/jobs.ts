import type { Think, ThinkSubmissionInspection } from "@cloudflare/think";
import type { Schedule } from "agents";
import type { UIMessage } from "ai";

import type { JobInfo, NewJob, ServerEvent } from "@cot/shared";

import {
  broadcastEvent,
  byNextRun,
  cancelOwnJob,
  JOB_CALLBACK,
  listOwnJobs,
  SCHEDULED_TASK_SOURCE,
  toJob,
  toJobInfo,
  type Job,
  type JobPayload
} from "../common/jobs";
import type { PiAssistant } from "../pi/pi-assistant";

/** The Think assistant, as far as running jobs is concerned. */
type JobAgent = Think<Env> & {
  executeTask(payload: JobPayload, schedule?: Schedule<JobPayload>): unknown;
};

const MAX_DESCRIPTION = 200;
const MAX_PROMPT = 4000;

function messageText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/**
 * Scheduled jobs of one user. They all live in the Think assistant, which
 * delegates here: a reminder notifies the user when it fires; a task becomes
 * a durable Think submission in the shared conversation, and its reply is
 * sent when the submission settles. Reminders the Pi assistant scheduled
 * before jobs moved here are listed and cancelled through it.
 */
export class AssistantJobs {
  constructor(
    private readonly options: {
      agent: JobAgent;
      pi: () => Promise<DurableObjectStub<PiAssistant>>;
      sendToTelegram: (text: string) => Promise<void>;
    }
  ) {}

  async schedule(when: Date | number | string, job: Job): Promise<JobInfo> {
    const description = job.description.trim();
    const prompt = job.prompt?.trim();
    if (!description) throw new Error("Describe the reminder or task.");
    if (when instanceof Date && Number.isNaN(when.getTime())) {
      throw new Error("That date isn't valid.");
    }
    const schedule = await this.options.agent.schedule<Job>(
      when,
      JOB_CALLBACK,
      prompt ? { description, prompt } : { description },
      { idempotent: true }
    );
    return toJobInfo(schedule, "think");
  }

  /** Schedules a job sent by a client, validating it first. */
  async create(job: NewJob) {
    const { description, prompt, when } = job;
    if (
      typeof description !== "string" ||
      description.length > MAX_DESCRIPTION
    ) {
      throw new Error("Give a description of up to 200 characters.");
    }
    if (
      prompt !== undefined &&
      (typeof prompt !== "string" || prompt.length > MAX_PROMPT)
    ) {
      throw new Error("Keep the instruction under 4000 characters.");
    }
    switch (when?.type) {
      case "date":
        if (!(new Date(when.date).getTime() > Date.now())) {
          throw new Error("Pick a time in the future.");
        }
        return this.schedule(new Date(when.date), { description, prompt });
      case "cron":
        if (typeof when.cron !== "string" || !when.cron.trim()) {
          throw new Error("Enter a cron expression.");
        }
        return this.schedule(when.cron.trim(), { description, prompt });
      default:
        throw new Error("Choose when the job runs.");
    }
  }

  async list() {
    const own = await listOwnJobs(this.options.agent, "think");
    const pi = await (
      await this.options.pi()
    )
      .listOwnJobs()
      .catch((error: unknown) => {
        console.error(error);
        return [];
      });
    const all = [...own, ...pi];
    // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array; toSorted needs ES2023
    all.sort(byNextRun);
    return all;
  }

  async cancel(id: string) {
    if (typeof id !== "string") throw new Error("Give a job id.");
    if (await cancelOwnJob(this.options.agent, id)) return true;
    return (await this.options.pi()).cancelOwnJob(id);
  }

  /** Runs a job that is due (the schedule callback). */
  async run(payload: JobPayload, schedule?: Schedule<JobPayload>) {
    const job = toJob(payload);
    if (!job.prompt) {
      await this.notify({
        type: "reminder",
        description: job.description,
        timestamp: new Date().toISOString()
      });
      await this.options.sendToTelegram(`⏰ Reminder: ${job.description}`);
      return;
    }
    const text = `⏰ Scheduled task: ${job.description}\n\n${job.prompt}`;
    await this.options.agent.submitMessages(
      [
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text }]
        }
      ],
      {
        // Delivery is at-least-once; a retried occurrence returns the
        // existing submission instead of running the task twice.
        idempotencyKey: schedule
          ? `job:${schedule.id}:${schedule.time}`
          : undefined,
        metadata: {
          source: SCHEDULED_TASK_SOURCE,
          description: job.description
        }
      }
    );
  }

  /** Sends the reply of a scheduled task once its submission settles. */
  async onSubmission(submission: ThinkSubmissionInspection) {
    const { metadata, status } = submission;
    if (metadata?.source !== SCHEDULED_TASK_SOURCE) return;
    if (status !== "completed" && status !== "error") return;
    const description =
      typeof metadata.description === "string" ? metadata.description : "";
    const ok = status === "completed";
    // A completed submission carries the id of the reply it persisted.
    const reply = this.options.agent.messages.find(
      (m) => m.id === submission.messageId
    );
    const text = ok
      ? (reply && messageText(reply)) || "(no reply)"
      : (submission.error ?? "The task failed.");
    await this.notify({
      type: "task-result",
      description,
      ok,
      text,
      timestamp: new Date().toISOString()
    });
    await this.options.sendToTelegram(
      ok ? `✅ ${description}\n\n${text}` : `⚠️ ${description} failed: ${text}`
    );
  }

  /** Shows the event in open chats of both harnesses. */
  private async notify(event: ServerEvent) {
    broadcastEvent(this.options.agent, event);
    const pi = await this.options.pi();
    await pi.notify(event).catch((error: unknown) => console.error(error));
  }
}
