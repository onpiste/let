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

export const REMINDER_HINT =
  "When the user asks to be reminded of something, use the scheduleTask tool.";
