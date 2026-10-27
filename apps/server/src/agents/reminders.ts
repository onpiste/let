import type { Agent } from "agents";

import type { ServerEvent } from "@cot/shared";

/** An agent that can fire reminders through its `executeTask` callback. */
type ReminderAgent = Agent<Env> & {
  executeTask(description: string): Promise<void>;
};

/**
 * Reminder logic shared by the Think and Pi assistants. Each harness wraps
 * these in its own tool format; the scheduling itself is plain Agents SDK.
 */
export async function setReminder(
  agent: ReminderAgent,
  when: Date | number | string,
  description: string
) {
  await agent.schedule(when, "executeTask", description, { idempotent: true });
  return `Reminder set: "${description}" (${when instanceof Date ? when.toISOString() : when})`;
}

export function listReminders(agent: ReminderAgent) {
  const tasks = agent.getSchedules();
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
