import { scheduleSchema } from "agents/schedule";
import { tool } from "ai";
import { z } from "zod";

import type { JobInfo } from "@cot/shared";

import type { Job } from "../../common/jobs";
import {
  PROMPT_FIELD_DESCRIPTION,
  SCHEDULE_TOOL_DESCRIPTION
} from "../../common/prompt";

/** Where jobs are kept: the Think assistant itself. */
export type JobScheduler = {
  scheduleJob(when: Date | number | string, job: Job): Promise<JobInfo>;
  listJobs(): Promise<JobInfo[]>;
  cancelJob(id: string): Promise<boolean>;
};

export function scheduleTools(jobs: JobScheduler) {
  return {
    scheduleTask: tool({
      description: SCHEDULE_TOOL_DESCRIPTION,
      inputSchema: scheduleSchema.extend({
        prompt: z.string().optional().describe(PROMPT_FIELD_DESCRIPTION)
      }),
      execute: async ({ when, description, prompt }) => {
        const input =
          when.type === "scheduled"
            ? new Date(when.date)
            : when.type === "delayed"
              ? when.delayInSeconds
              : when.type === "cron"
                ? when.cron
                : null;
        if (input === null) return "Not a valid schedule input";
        try {
          return {
            scheduled: await jobs.scheduleJob(input, { description, prompt })
          };
        } catch (error) {
          return `Error scheduling: ${String(error)}`;
        }
      }
    }),

    getScheduledTasks: tool({
      description: "List the scheduled reminders and tasks",
      inputSchema: z.object({}),
      execute: async () => {
        const list = await jobs.listJobs();
        return list.length > 0 ? list : "Nothing is scheduled.";
      }
    }),

    cancelScheduledTask: tool({
      description: "Cancel a scheduled reminder or task by its ID",
      inputSchema: z.object({
        taskId: z.string().describe("The ID of the job to cancel")
      }),
      execute: async ({ taskId }) => {
        try {
          return (await jobs.cancelJob(taskId))
            ? `Cancelled ${taskId}.`
            : `Nothing scheduled with id ${taskId}.`;
        } catch (error) {
          return `Error cancelling: ${String(error)}`;
        }
      }
    })
  };
}
