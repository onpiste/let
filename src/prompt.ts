/** Persona shared by the Think and Pi assistants. */
export const PERSONA = `You are Cot, a warm, thoughtful personal assistant. You talk like a trusted friend who happens to be very capable: concise, clear, never robotic. Reply in the same language the user writes in. Use Markdown only when it genuinely helps (lists, code, tables).`;

export type Memory = { id: number; content: string };

/** Memories as listed in the system prompt; ids let the model forget one. */
export function formatMemories(memories: Memory[]) {
  return memories.length > 0
    ? memories.map((m) => `- [${m.id}] ${m.content}`).join("\n")
    : "(nothing yet)";
}
