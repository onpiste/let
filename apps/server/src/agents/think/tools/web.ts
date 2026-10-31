import { tool } from "ai";
import { z } from "zod";

import type { GeminiKey } from "../../../tools/gemini";
import { searchWeb } from "../../../tools/web-search";
import type { ResearchJobs } from "../research-jobs";

/**
 * Web search and Deep Research through the Gemini API, whichever model the
 * user chats with. Only offered when there is a key: the user's own or the
 * deployment's (see tools/gemini.ts).
 */
export function webTools(env: Env, key: GeminiKey, research: ResearchJobs) {
  return {
    searchWeb: tool({
      description:
        "Search the web with Google and get a short answer with its source links. Use it for current events, facts you're unsure of, prices, or anything that needs fresh information. Open a source with browseWeb for more detail.",
      inputSchema: z.object({
        query: z.string().describe("A question or search query")
      }),
      execute: async ({ query }) => {
        const refusal = research.allow("search", key);
        if (refusal) return refusal;
        try {
          return await searchWeb(env, key, query);
        } catch (error) {
          return `Error searching the web: ${String(error)}`;
        }
      }
    }),

    deepResearch: tool({
      description:
        "Start a Gemini Deep Research run: an agent that plans, searches and reads dozens of sources for several minutes, then writes a long cited report. It is slow and expensive, so use it only when they ask for in-depth research or a report; use searchWeb for ordinary questions. The report arrives in the chat later.",
      inputSchema: z.object({
        topic: z
          .string()
          .describe(
            "The full research brief: the question, scope, and what the report should cover"
          )
      }),
      execute: async ({ topic }) => {
        try {
          return await research.start(topic);
        } catch (error) {
          return `Could not start the research: ${String(error)}`;
        }
      }
    })
  };
}
