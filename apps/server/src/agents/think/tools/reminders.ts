import { scheduleSchema } from "agents/schedule";
import { tool } from "ai";
import { z } from "zod";

import {
  cancelReminder,
  listReminders,
  setReminder,
  type ReminderAgent
} from "../../common/reminders";

export function reminderTools(agent: ReminderAgent) {
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
          return await setReminder(agent, input, description);
        } catch (error) {
          return `Error scheduling task: ${String(error)}`;
        }
      }
    }),

    getScheduledTasks: tool({
      description: "List all scheduled reminders",
      inputSchema: z.object({}),
      execute: async () => listReminders(agent)
    }),

    cancelScheduledTask: tool({
      description: "Cancel a scheduled reminder by its ID",
      inputSchema: z.object({
        taskId: z.string().describe("The ID of the task to cancel")
      }),
      execute: async ({ taskId }) => {
        try {
          return await cancelReminder(agent, taskId);
        } catch (error) {
          return `Error cancelling reminder: ${String(error)}`;
        }
      }
    })
  };
}
