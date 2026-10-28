import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { BridgeConfig } from "../config";
import { resolveInRoots } from "../paths";
import { formatResult, run, shellCommand } from "../proc";
import { failure, text } from "./result";

export function registerShellTools(server: McpServer, config: BridgeConfig) {
  server.registerTool(
    "run_command",
    {
      description:
        "Run a shell command on the user's computer (PowerShell on Windows, sh elsewhere) and return its combined output and exit code.",
      inputSchema: z.object({
        command: z.string().describe("The command line to run"),
        cwd: z
          .string()
          .optional()
          .describe("Working folder; defaults to the first allowed folder"),
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(900)
          .default(120)
          .describe("Stop the command after this long")
      })
    },
    async ({ command, cwd, timeoutSeconds }, ctx) => {
      if (!config.allowShell) {
        return failure("Shell commands are turned off on this device.");
      }
      try {
        const dir = await resolveInRoots(config.roots, cwd ?? ".");
        const result = await run(shellCommand(command), {
          cwd: dir,
          timeoutMs: timeoutSeconds * 1000,
          signal: ctx.mcpReq.signal,
          onTick: () => void ctx.mcpReq.log("info", "running").catch(() => {})
        });
        return text(formatResult(result));
      } catch (error) {
        return failure(error);
      }
    }
  );
}
