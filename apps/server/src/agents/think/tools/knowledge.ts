import { tool } from "ai";
import { z } from "zod";

import { searchKnowledge } from "../../../knowledge/search";

/** Search the owner's uploaded documents and the shared library. */
export function knowledgeTools(env: Env, owner: string) {
  return {
    searchKnowledge: tool({
      description:
        "Search the user's knowledge base (documents they uploaded in Settings, plus the shared library) for passages relevant to a question. Use it before answering questions about their documents, products, policies or field, and name the source file you rely on.",
      inputSchema: z.object({
        query: z.string().describe("What to look for, in natural language")
      }),
      execute: async ({ query }) => {
        try {
          return await searchKnowledge(env, owner, query);
        } catch (error) {
          return `Error searching the knowledge base: ${String(error)}`;
        }
      }
    })
  };
}
