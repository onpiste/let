import { tool } from "ai";
import { z } from "zod";

import { browsePage } from "../../../tools/browser";
import { runCode } from "../../../tools/code-runner";

/** Stateless tools: run a snippet, read a page. */
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
