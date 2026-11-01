import { scheduleSchema } from "agents/schedule";
import { tool } from "ai";
import { z } from "zod";

import type { ScheduledTask, TaskSchedule } from "@cot/shared";

/** The assistant's scheduled tasks, which a chat reaches over RPC. */
export type Reminders = {
  setReminder(
    when: Date | string | number,
    description: string
  ): Promise<string>;
  listTasks(): Promise<ScheduledTask[]>;
  updateTask(
    id: string,
    change: { description?: string; schedule?: TaskSchedule }
  ): Promise<ScheduledTask[]>;
  pauseTask(id: string): Promise<ScheduledTask[]>;
  resumeTask(id: string): Promise<ScheduledTask[]>;
  deleteTask(id: string): Promise<ScheduledTask[]>;
};

export function reminderTools(reminders: Reminders) {
  return {
    scheduleTask: tool({
      description:
        "Schedule a reminder. Use this when the user asks to be reminded or wants something done later.",
      inputSchema: scheduleSchema,
      execute: async ({ when, description }) => {
        if (when.type === "no-schedule") {
          return "Not a valid schedule input";
        }
        const input =
          when.type === "scheduled"
            ? when.date
            : when.type === "delayed"
              ? when.delayInSeconds
              : when.type === "cron"
                ? when.cron
                : null;
        if (!input) return "Invalid schedule type";
        try {
          return await reminders.setReminder(input, description);
        } catch (error) {
          return `Error scheduling task: ${String(error)}`;
        }
      }
    }),

    getScheduledTasks: tool({
      description:
        "List all scheduled tasks with their ids, schedules and whether they are paused",
      inputSchema: z.object({}),
      execute: async () => {
        const tasks = await reminders.listTasks();
        return tasks.length > 0 ? tasks : "No reminders scheduled.";
      }
    }),

    updateScheduledTask: tool({
      description:
        "Change a scheduled task's text and/or time. Look up its id with getScheduledTasks first. Give at most one of date, delayInSeconds or cron; omit all to keep the time. A paused task stays paused.",
      inputSchema: z.object({
        taskId: z.string().describe("The ID of the task to change"),
        description: z.string().optional().describe("The new reminder text"),
        date: z.string().optional().describe("ISO date-time, for a one-off"),
        delayInSeconds: z.number().optional().describe("Seconds from now"),
        cron: z.string().optional().describe("Cron expression, for a repeat")
      }),
      execute: async ({ taskId, description, date, delayInSeconds, cron }) => {
        const schedule: TaskSchedule | undefined = date
          ? { kind: "once", at: new Date(date).toISOString() }
          : delayInSeconds !== undefined
            ? {
                kind: "once",
                at: new Date(Date.now() + delayInSeconds * 1000).toISOString()
              }
            : cron
              ? { kind: "cron", cron }
              : undefined;
        try {
          await reminders.updateTask(taskId, { description, schedule });
          return `Task ${taskId} updated.`;
        } catch (error) {
          return `Error updating task: ${String(error)}`;
        }
      }
    }),

    pauseScheduledTask: tool({
      description:
        "Pause a scheduled task so it stops firing but is kept. Resume it later with resumeScheduledTask.",
      inputSchema: z.object({ taskId: z.string() }),
      execute: async ({ taskId }) => {
        try {
          await reminders.pauseTask(taskId);
          return `Task ${taskId} paused.`;
        } catch (error) {
          return `Error pausing task: ${String(error)}`;
        }
      }
    }),

    resumeScheduledTask: tool({
      description: "Resume a paused scheduled task",
      inputSchema: z.object({ taskId: z.string() }),
      execute: async ({ taskId }) => {
        try {
          await reminders.resumeTask(taskId);
          return `Task ${taskId} resumed.`;
        } catch (error) {
          return `Error resuming task: ${String(error)}`;
        }
      }
    }),

    cancelScheduledTask: tool({
      description: "Delete a scheduled task by its ID",
      inputSchema: z.object({
        taskId: z.string().describe("The ID of the task to delete")
      }),
      execute: async ({ taskId }) => {
        try {
          await reminders.deleteTask(taskId);
          return `Task ${taskId} deleted.`;
        } catch (error) {
          return `Error deleting task: ${String(error)}`;
        }
      }
    })
  };
}
