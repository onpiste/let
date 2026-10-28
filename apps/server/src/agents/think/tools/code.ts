import { tool } from "ai";
import { z } from "zod";

import type { Sandbox } from "../../../tools/sandbox";
import { runCodeTask } from "../../pi/code-agent";

/** Hands multi-step programming work to the Pi coding agent. */
export function codeTools(env: Env, sandbox: DurableObjectStub<Sandbox>) {
  return {
    codeTask: tool({
      description:
        "Delegate a substantial programming job (build a script or app, fix or refactor code, analyse data with code) to a coding agent that works in the Linux sandbox and reports back. Describe the task completely, since it cannot see this chat. For quick calculations use runCode instead.",
      inputSchema: z.object({
        task: z
          .string()
          .describe("A self-contained description of what to build or do")
      }),
      // The agent runs commands on its own, so the user approves up front.
      needsApproval: true,
      execute: async ({ task }, { abortSignal }) => {
        try {
          return await runCodeTask({
            env,
            sandbox,
            task,
            signal: abortSignal
          });
        } catch (error) {
          return `The coding agent failed: ${String(error)}`;
        }
      }
    })
  };
}
