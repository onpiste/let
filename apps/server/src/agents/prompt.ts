import type { Settings } from "@cot/shared";

export type Memory = { id: number; content: string };

/** Memories as listed in the system prompt; ids let the model forget one. */
export function formatMemories(memories: Memory[]) {
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
