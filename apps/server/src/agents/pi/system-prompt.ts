import { memorySection, REMINDER_HINT, type Memory } from "../common/prompt";

/** The Pi assistant's system prompt: shared persona and memory, no sandbox. */
export function buildPiSystemPrompt(persona: string, memories: Memory[]) {
  return `${persona}

${memorySection(memories)}

${REMINDER_HINT}`;
}
