import { tool } from "ai";
import { z } from "zod";

/** Gemini calls, made by the assistant that holds the key and the limits. */
export type WebAccess = {
  searchWeb(query: string): Promise<string>;
  /** Starts a run whose report is added to the calling chat. */
  deepResearch(topic: string): Promise<string>;
};

/**
 * Web search and Deep Research through the Gemini API, whichever model the
 * user chats with. Only offered when there is a key: the user's own or the
 * deployment's (see tools/gemini.ts).
 */
export function webTools(web: WebAccess) {
  return {
    searchWeb: tool({
      description:
        "Search the web with Google and get a short answer with its source links. Use it for current events, facts you're unsure of, prices, or anything that needs fresh information. Open a source with browseWeb for more detail.",
      inputSchema: z.object({
        query: z.string().describe("A question or search query")
      }),
      // Failures throw, so the call ends as an error the chat can show.
      execute: async ({ query }) => web.searchWeb(query)
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
      execute: async ({ topic }) => web.deepResearch(topic)
    })
  };
}
