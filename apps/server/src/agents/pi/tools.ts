import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type, type TSchema } from "@mariozechner/pi-ai";
import { getSchedulePrompt } from "agents/schedule";

import {
  PROMPT_FIELD_DESCRIPTION,
  SCHEDULE_TOOL_DESCRIPTION
} from "../common/prompt";
import type { JobScheduler } from "../think/tools/schedule";

/** Where memories and jobs live: the user's Think assistant, over RPC. */
export type MemoryStore = JobScheduler & {
  addMemory(content: string): Promise<void>;
  removeMemory(id: number): Promise<void>;
};

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {} };
}

/** The Pi assistant's tools, in Pi's (TypeBox) tool format. */
export function piTools(memory: MemoryStore): AgentTool[] {
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
      label: "Schedule",
      description: `${SCHEDULE_TOOL_DESCRIPTION} Give exactly one of date, delayInSeconds or cron.

  ${getSchedulePrompt({ date: new Date() })}`,
      parameters: Type.Object({
        description: Type.String({
          description: "Short description of the reminder or task"
        }),
        prompt: Type.Optional(
          Type.String({ description: PROMPT_FIELD_DESCRIPTION })
        ),
        date: Type.Optional(
          Type.String({ description: "ISO date-time for a one-off job" })
        ),
        delayInSeconds: Type.Optional(
          Type.Number({ description: "Seconds from now" })
        ),
        cron: Type.Optional(
          Type.String({ description: "Cron expression for a repeating one" })
        )
      }),
      execute: async (
        _id,
        { description, prompt, date, delayInSeconds, cron }
      ) => {
        const when = date ? new Date(date) : (delayInSeconds ?? cron);
        if (when === undefined) {
          throw new Error("Give one of date, delayInSeconds or cron");
        }
        const job = await memory.scheduleJob(when, { description, prompt });
        return text(JSON.stringify({ scheduled: job }));
      }
    }),
    tool({
      name: "getScheduledTasks",
      label: "List scheduled",
      description: "List the scheduled reminders and tasks",
      parameters: Type.Object({}),
      execute: async () => {
        const jobs = await memory.listJobs();
        return text(
          jobs.length > 0 ? JSON.stringify(jobs) : "Nothing is scheduled."
        );
      }
    }),
    tool({
      name: "cancelScheduledTask",
      label: "Cancel scheduled",
      description: "Cancel a scheduled reminder or task by its ID",
      parameters: Type.Object({
        taskId: Type.String({ description: "The ID of the job to cancel" })
      }),
      execute: async (_id, { taskId }) =>
        text(
          (await memory.cancelJob(taskId))
            ? `Cancelled ${taskId}.`
            : `Nothing scheduled with id ${taskId}.`
        )
    })
  ];
}
