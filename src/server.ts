import { Think } from "@cloudflare/think";
import { routeAgentRequest, type Schedule } from "agents";
import type { ContextConfig } from "agents/context";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { tool } from "ai";
import { z } from "zod";

const SOUL = `You are Cot, a warm, thoughtful personal assistant. You talk like a trusted friend who happens to be very capable: concise, clear, never robotic. Reply in the same language the user writes in. Use Markdown only when it genuinely helps (lists, code, tables).

You have a long-term memory about the user (the "memory" block). When they share something worth remembering, append it to memory with set_context without asking. Use what you know naturally — don't recite the memory back. If something you remembered is no longer true, rewrite the memory block without it.

When the user asks to be reminded of something, use the scheduleTask tool.`;

/**
 * A personal assistant on Think. Each browser gets its own Durable Object
 * instance (keyed by a random id on the client); Think keeps the chat
 * history and the memory block, and the agent keeps scheduled reminders.
 */
export class Assistant extends Think<Env> {
  getModel() {
    return "@cf/moonshotai/kimi-k2.7-code";
  }

  configureContext(): ContextConfig[] {
    return [
      { label: "soul", provider: { get: async () => SOUL } },
      {
        label: "memory",
        description:
          "Durable facts about the user: name, preferences, people in their life, goals, ongoing projects, important dates. One fact per line.",
        maxTokens: 2_000,
        // Show newly saved facts on the next turn without rebuilding the
        // cached system prompt.
        whenChanged: "remind"
      }
    ];
  }

  getTools() {
    return {
      scheduleTask: tool({
        description: `Schedule a reminder. Use this when the user asks to be reminded or wants something done later.

${getSchedulePrompt({ date: new Date() })}`,
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
            this.schedule(input, "executeTask", description, {
              idempotent: true
            });
            return `Reminder set: "${description}" (${when.type}: ${input})`;
          } catch (error) {
            return `Error scheduling task: ${error}`;
          }
        }
      }),

      getScheduledTasks: tool({
        description: "List all scheduled reminders",
        inputSchema: z.object({}),
        execute: async () => {
          const tasks = this.getSchedules();
          return tasks.length > 0 ? tasks : "No reminders scheduled.";
        }
      }),

      cancelScheduledTask: tool({
        description: "Cancel a scheduled reminder by its ID",
        inputSchema: z.object({
          taskId: z.string().describe("The ID of the task to cancel")
        }),
        execute: async ({ taskId }) => {
          try {
            this.cancelSchedule(taskId);
            return `Reminder ${taskId} cancelled.`;
          } catch (error) {
            return `Error cancelling reminder: ${error}`;
          }
        }
      })
    };
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Broadcast instead of saveMessages() so the reminder doesn't enter the
    // chat history and trigger another model turn.
    this.broadcast(
      JSON.stringify({
        type: "reminder",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
