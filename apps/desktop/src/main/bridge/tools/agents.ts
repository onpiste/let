import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { resolveInRoots } from "../paths";
import { formatResult, programCommand, run } from "../proc";
import { which } from "../which";
import { defineTool, type ToolContext } from "./define";
import { failure, text } from "./result";

export function registerAgentTools(server: McpServer, ctx: ToolContext) {
  const { policy } = ctx;
  const names = Object.keys(policy.agents);
  if (names.length === 0) return;

  defineTool(
    server,
    ctx,
    "list_agents",
    "List the coding agents installed on the user's computer that run_agent can start.",
    z.object({}),
    () => {
      const lines = names.map((name) => {
        const exe = policy.agents[name]?.[0];
        return `${name}: ${exe && which(exe) ? "installed" : "not installed"}`;
      });
      return text(lines.join("\n"));
    }
  );

  defineTool(
    server,
    ctx,
    "run_agent",
    "Hand a job to a coding agent (Claude Code, Codex, Pi, …) running on the user's computer and return its final answer. It works in the given folder and cannot see this chat, so describe the task completely. Can take many minutes.",
    z.object({
      agent: z.string().describe(`One of: ${names.join(", ")}`),
      prompt: z.string().describe("A self-contained task description"),
      cwd: z.string().optional().describe("Project folder"),
      timeoutMinutes: z.number().int().min(1).max(60).default(15)
    }),
    async ({ agent, prompt, cwd, timeoutMinutes }, extra) => {
      const [exe, ...args] = policy.agents[agent] ?? [];
      if (!exe) {
        return failure(
          `Unknown agent ${agent}. Available: ${names.join(", ")}.`
        );
      }
      const path = which(exe);
      if (!path) return failure(`${agent} is not installed on this device.`);
      try {
        const dir = await resolveInRoots(policy.roots, cwd ?? ".");
        const argv = programCommand(
          path,
          args.map((a) => a.replaceAll("{prompt}", prompt))
        );
        const result = await run(argv, {
          cwd: dir,
          timeoutMs: timeoutMinutes * 60_000,
          signal: extra.mcpReq.signal,
          // Progress bytes keep the tunnel from closing an idle request.
          onTick: () =>
            void extra.mcpReq.log("info", `${agent} is working`).catch(() => {})
        });
        return text(formatResult(result));
      } catch (error) {
        return failure(error);
      }
    }
  );
}
