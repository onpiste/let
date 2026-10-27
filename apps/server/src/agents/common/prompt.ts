import type { Settings } from "@cot/shared";

export type Memory = { id: number; content: string };

/** Memories as listed in the system prompt; ids let the model forget one. */
function formatMemories(memories: Memory[]) {
  return memories.length > 0
    ? memories.map((m) => `- [${m.id}] ${m.content}`).join("\n")
    : "(nothing yet)";
}

/** The persona both harnesses start their system prompt with. */
export function buildPersona(settings: Settings) {
  const language =
    settings.language === "auto"
      ? "Reply in the same language the user writes in."
      : `Always reply in ${settings.language}, whatever language the user writes in.`;
  const persona = `You are ${settings.assistantName}, a warm, thoughtful personal assistant. You talk like a trusted friend who happens to be very capable: concise, clear, never robotic. ${language} Use Markdown only when it genuinely helps (lists, code, tables).`;
  return settings.instructions.trim()
    ? `${persona}\n\nThe user's instructions for you:\n${settings.instructions.trim()}`
    : persona;
}

/** How to use long-term memory, followed by what is remembered so far. */
export function memorySection(memories: Memory[]) {
  return `You have a long-term memory about the user. When they share something worth remembering (name, preferences, people in their life, goals, ongoing projects, important dates), save it with the remember tool without asking. Use what you know naturally — don't recite the memory back. If something you remembered is no longer true, forget it and remember the new fact.

What you remember about the user:
${formatMemories(memories)}`;
}

export const SCHEDULE_HINT =
  "When the user asks to be reminded of something, or wants something done at a later or recurring time, use the scheduleTask tool.";

/** How the scheduleTask tool is explained to the model, in both harnesses. */
export const SCHEDULE_TOOL_DESCRIPTION =
  "Schedule a reminder or a task. A reminder only notifies the user at that time. A task is something the user wants done at that time (look something up, summarize, check a page, write something): give `prompt`, the instruction you will carry out then, written so it makes sense on its own. The result is sent to the user in the app and on Telegram.";

export const PROMPT_FIELD_DESCRIPTION =
  "For a task: the instruction to carry out when it runs. Leave out for a plain reminder.";

/**
 * The current time for the model, since schedules (cron included) run in
 * UTC. `timezone` is the IANA zone Cloudflare saw the user in, if known.
 */
export function timeNote(timezone: string | null, now = new Date()) {
  const utc = `Current time: ${now.toUTCString()}.`;
  const fallback = `${utc} Schedules, cron included, run in UTC.`;
  if (!timezone) return fallback;
  try {
    const local = now.toLocaleString("en-US", {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "short"
    });
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset"
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value;
    return `${utc} The user is in ${timezone} (${offset ?? "unknown offset"}), where it is ${local}. Schedules, cron included, run in UTC: convert the user's local times to UTC.`;
  } catch {
    // An unknown zone name throws a RangeError.
    return fallback;
  }
}
