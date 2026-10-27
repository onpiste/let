import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type, type TSchema } from "@mariozechner/pi-ai";
import { getSchedulePrompt } from "agents/schedule";

import {
  cancelReminder,
  listReminders,
  setReminder,
  type ReminderAgent
} from "../common/reminders";

/** Where memories live: the same user's Think assistant, over RPC. */
export type MemoryStore = {
  addMemory(content: string): Promise<void>;
  removeMemory(id: number): Promise<void>;
};

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {} };
}

/** The Pi assistant's tools, in Pi's (TypeBox) tool format. */
export function piTools(
  agent: ReminderAgent,
  memory: MemoryStore
): AgentTool[] {
  const tool = <P extends TSchema>(t: AgentTool<P>) =>
    t as unknown as AgentTool;
  return [
    tool({
      name: "remember",
      label: "Remember",
      description:
        "Save a durable fact about the user to long-term memory (preferences, people, goals, dates, etc).",
      parameters: Type.Object({
        content: Type.String({
          description: "One short, self-contained fact about the user"
        })
      }),
      execute: async (_id, { content }) => {
        await memory.addMemory(content);
        return text(`Remembered: ${content}`);
      }
    }),
    tool({
      name: "forget",
      label: "Forget",
      description: "Delete a memory by its id when it is wrong or outdated.",
      parameters: Type.Object({
        id: Type.Number({ description: "The memory id shown in brackets" })
      }),
      execute: async (_id, { id }) => {
        await memory.removeMemory(id);
        return text(`Forgot memory ${id}.`);
      }
    }),
    tool({
      name: "scheduleTask",
      label: "Schedule reminder",
      description: `Schedule a reminder. Use this when the user asks to be reminded or wants something done later. Give exactly one of date, delayInSeconds or cron.

  ${getSchedulePrompt({ date: new Date() })}`,
      parameters: Type.Object({
        description: Type.String({ description: "What to remind about" }),
        date: Type.Optional(
          Type.String({ description: "ISO date-time for a one-off reminder" })
        ),
        delayInSeconds: Type.Optional(
          Type.Number({ description: "Seconds from now" })
        ),
        cron: Type.Optional(
          Type.String({ description: "Cron expression for a repeating one" })
        )
      }),
      execute: async (_id, { description, date, delayInSeconds, cron }) => {
        const when = date ? new Date(date) : (delayInSeconds ?? cron);
        if (when === undefined) {
          throw new Error("Give one of date, delayInSeconds or cron");
        }
        return text(await setReminder(agent, when, description));
      }
    }),
    tool({
      name: "getScheduledTasks",
      label: "List reminders",
      description: "List all scheduled reminders",
      parameters: Type.Object({}),
      execute: async () => text(JSON.stringify(listReminders(agent)))
    }),
    tool({
      name: "cancelScheduledTask",
      label: "Cancel reminder",
      description: "Cancel a scheduled reminder by its ID",
      parameters: Type.Object({
        taskId: Type.String({ description: "The ID of the task to cancel" })
      }),
      execute: async (_id, { taskId }) =>
        text(await cancelReminder(agent, taskId))
    })
  ];
}
