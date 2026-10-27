import type { Agent } from "agents";

import type { ServerEvent } from "@cot/shared";

/** An agent that can fire reminders through its `executeTask` callback. */
export type ReminderAgent = Agent<Env> & {
  executeTask(description: string): Promise<void>;
};

/**
 * Reminder logic shared by the Think and Pi assistants. Each harness wraps
 * these in its own tool format; the scheduling itself is plain Agents SDK.
 */
export async function setReminder(
  agent: ReminderAgent,
  env: Env,
  when: Date | number | string,
  description: string
) {
  const max = Number(env.MAX_REMINDERS) || 0;
  if (max > 0 && reminders(agent).length >= max) {
    return `You already have ${max} reminders, the most allowed. Cancel one first.`;
  }
  await agent.schedule(when, "executeTask", description, { idempotent: true });
  return `Reminder set: "${description}" (${when instanceof Date ? when.toISOString() : when})`;
}

/** Only reminders; the SDK may keep other schedules of its own. */
function reminders(agent: ReminderAgent) {
  return agent.getSchedules().filter((s) => s.callback === "executeTask");
}

export function listReminders(agent: ReminderAgent) {
  const tasks = reminders(agent);
  return tasks.length > 0 ? tasks : "No reminders scheduled.";
}

export async function cancelReminder(agent: ReminderAgent, taskId: string) {
  await agent.cancelSchedule(taskId);
  return `Reminder ${taskId} cancelled.`;
}

export function broadcastReminder(agent: ReminderAgent, description: string) {
  // Broadcast instead of saving a message so the reminder doesn't enter the
  // chat history and trigger another model turn.
  const event: ServerEvent = {
    type: "reminder",
    description,
    timestamp: new Date().toISOString()
  };
  agent.broadcast(JSON.stringify(event));
}
