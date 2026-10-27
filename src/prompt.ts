export type Memory = { id: number; content: string };

/** Memories as listed in the system prompt; ids let the model forget one. */
export function formatMemories(memories: Memory[]) {
  return memories.length > 0
    ? memories.map((m) => `- [${m.id}] ${m.content}`).join("\n")
    : "(nothing yet)";
}
