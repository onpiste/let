import { tool } from "ai";
import { z } from "zod";

import { requiresApproval, type ApprovalMode } from "@cot/shared";

import type { Sandbox } from "../../../tools/sandbox";

/** Shell and file tools for the user's persistent Linux sandbox. */
export function sandboxTools(
  sandbox: DurableObjectStub<Sandbox>,
  approvalMode: () => ApprovalMode
) {
  return {
    runCommand: tool({
      description:
        "Run a shell command (sh) in the Linux sandbox, starting in /workspace. Files and installed packages persist across turns while the sandbox is running. Returns the exit code, stdout and stderr.",
      inputSchema: z.object({
        command: z.string().describe("The shell command to run"),
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(300)
          .optional()
          .describe("Give up after this many seconds (default 60)")
      }),
      // Read per call, so a settings change applies without a restart.
      needsApproval: ({ command }) =>
        requiresApproval(approvalMode(), "runCommand", { command }),
      execute: async ({ command, timeoutSeconds }) =>
        sandbox.runCommand(command, (timeoutSeconds ?? 60) * 1000)
    }),

    writeSandboxFile: tool({
      description:
        "Write a text file in the Linux sandbox. Relative paths resolve against /workspace.",
      inputSchema: z.object({
        path: z.string().describe("File path, e.g. notes/todo.md"),
        content: z.string().describe("The full file content")
      }),
      needsApproval: ({ path }) =>
        requiresApproval(approvalMode(), "writeSandboxFile", { path }),
      execute: async ({ path, content }) => sandbox.writeFile(path, content)
    }),

    readSandboxFile: tool({
      description:
        "Read a text file from the Linux sandbox. Relative paths resolve against /workspace.",
      inputSchema: z.object({
        path: z.string().describe("File path to read")
      }),
      execute: async ({ path }) => sandbox.readFile(path)
    })
  };
}
