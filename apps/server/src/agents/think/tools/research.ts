import { tool } from "ai";
import { z } from "zod";

import { browsePage } from "../../../tools/browser";
import { runCode } from "../../../tools/code-runner";
import { searchKnowledge } from "../../../tools/knowledge";

/** Stateless tools: run a snippet, search the knowledge base, read a page. */
export function researchTools(env: Env) {
  return {
    runCode: tool({
      description:
        "Run a JavaScript (default) or Python snippet in a fresh, isolated runtime with no network, no files and a 5 s CPU limit. JavaScript runs as the body of an async function: use console.log and/or return a value. Python: print the output. Best for calculations, parsing and data transformations.",
      inputSchema: z.object({
        language: z.enum(["javascript", "python"]).default("javascript"),
        code: z.string().describe("The code to run")
      }),
      execute: async ({ language, code }) => {
        try {
          return await runCode(env, language, code);
        } catch (error) {
          return { logs: "", error: `The runtime stopped: ${String(error)}` };
        }
      }
    }),

    searchKnowledge: tool({
      description:
        "Search the user's knowledge base (documents uploaded to AI Search) for passages relevant to a question. Use it before answering questions about the user's own documents or notes.",
      inputSchema: z.object({
        query: z.string().describe("What to look for, in natural language")
      }),
      execute: async ({ query }) => {
        try {
          return await searchKnowledge(env, query);
        } catch (error) {
          return `Error searching the knowledge base: ${String(error)}`;
        }
      }
    }),

    browseWeb: tool({
      description:
        "Open a web page in a headless browser (JavaScript runs) and return its title and visible text. Use it for pages that need rendering, or to read a page the user links.",
      inputSchema: z.object({
        url: z.string().url().describe("Full http(s) URL to open")
      }),
      execute: async ({ url }) => {
        try {
          const page = await browsePage(env, url);
          return `${page.title}\n${page.url}\n\n${page.text}`;
        } catch (error) {
          return `Error opening ${url}: ${String(error)}`;
        }
      }
    })
  };
}
