import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { resolveInRoots } from "../paths";
import { formatResult, run, shellCommand } from "../proc";
import { defineTool, type ToolContext } from "./define";
import { failure, text } from "./result";

export function registerShellTools(server: McpServer, ctx: ToolContext) {
  const { policy } = ctx;
  if (!policy.allowShell) return;
  defineTool(
    server,
    ctx,
    "run_command",
    "Run a shell command on the user's computer (PowerShell on Windows, sh elsewhere) and return its combined output and exit code. Use it for command-line tools such as ffmpeg or ImageMagick.",
    z.object({
      command: z.string().describe("The command line to run"),
      cwd: z
        .string()
        .optional()
        .describe("Working folder; defaults to the first allowed folder"),
      timeoutSeconds: z.number().int().min(1).max(900).default(120)
    }),
    async ({ command, cwd, timeoutSeconds }, extra) => {
      try {
        const dir = await resolveInRoots(policy.roots, cwd ?? ".");
        const result = await run(shellCommand(command), {
          cwd: dir,
          timeoutMs: timeoutSeconds * 1000,
          signal: extra.mcpReq.signal,
          onTick: () => void extra.mcpReq.log("info", "running").catch(() => {})
        });
        return text(formatResult(result));
      } catch (error) {
        return failure(error);
      }
    }
  );
}
