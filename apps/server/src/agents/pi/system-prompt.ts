import { memorySection, SCHEDULE_HINT, type Memory } from "../common/prompt";

/** The Pi assistant's system prompt: shared persona and memory, no sandbox. */
export function buildPiSystemPrompt(
  persona: string,
  memories: Memory[],
  time: string
) {
  return `${persona}

${memorySection(memories)}

${time}

${SCHEDULE_HINT}`;
}
