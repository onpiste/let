import { tool } from "ai";
import { z } from "zod";

export type MemoryWriter = {
  addMemory(content: string): Promise<void>;
  removeMemory(id: number): Promise<void>;
};

export function memoryTools(memory: MemoryWriter) {
  return {
    remember: tool({
      description:
        "Save a durable fact about the user to long-term memory (preferences, people, goals, dates, etc).",
      inputSchema: z.object({
        content: z
          .string()
          .describe("One short, self-contained fact about the user")
      }),
      execute: async ({ content }) => {
        await memory.addMemory(content);
        return `Remembered: ${content}`;
      }
    }),

    forget: tool({
      description: "Delete a memory by its id when it is wrong or outdated.",
      inputSchema: z.object({
        id: z.number().describe("The memory id shown in brackets")
      }),
      execute: async ({ id }) => {
        await memory.removeMemory(id);
        return `Forgot memory ${id}.`;
      }
    })
  };
}
