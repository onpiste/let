import type { UIMessage } from "ai";

/**
 * A scheduled task runs as a turn of its own: the description goes into the
 * chat as a user message marked with `scheduledTask`, the model carries it
 * out with its tools, and its reply is what the owner is notified with.
 */

/** The user message a scheduled task starts its turn with. */
export function taskMessage(description: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: `⏰ ${description}` }],
    metadata: { createdAt: Date.now(), scheduledTask: description }
  };
}

/** The task the latest turn runs for, or null for an ordinary turn. */
export function scheduledTaskOf(messages: UIMessage[]): string | null {
  // A loop: the Worker's lib has no findLast.
  let latest: UIMessage | undefined;
  for (const message of messages) {
    if (message.role === "user") latest = message;
  }
  // Metadata is ours (taskMessage), or whatever a client sent: check it.
  const task = (latest?.metadata as { scheduledTask?: unknown } | undefined)
    ?.scheduledTask;
  return typeof task === "string" ? task : null;
}

/** The text of an assistant reply, without tool calls or reasoning. */
export function replyText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/** Added to the prompt of a scheduled turn; nobody is watching it. */
export const SCHEDULED_TURN_HINT = `This turn was started by a scheduled task the user set up earlier, not by a new message: the latest message is the task. Carry it out now with your tools (look things up, check, summarize) and reply with the result, written to the user. If it is only a reminder, remind them in a short, friendly line. Don't schedule it again: a repeating task fires on its own. Nobody can approve actions during this turn.`;
