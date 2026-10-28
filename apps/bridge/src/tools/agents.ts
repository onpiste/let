import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { BridgeConfig } from "../config";
import { resolveInRoots } from "../paths";
import { formatResult, run } from "../proc";
import { failure, text } from "./result";

/** Resolves the template's executable; Windows needs its .cmd shim path. */
function buildArgv(template: string[], prompt: string): string[] | null {
  const [exe, ...args] = template;
  const path = exe ? Bun.which(exe) : null;
  if (!path) return null;
  return [path, ...args.map((a) => a.replaceAll("{prompt}", prompt))];
}

export function registerAgentTools(server: McpServer, config: BridgeConfig) {
  const names = Object.keys(config.agents);
  if (names.length === 0) return;

  server.registerTool(
    "list_agents",
    {
      description:
        "List the coding agents installed on the user's computer that run_agent can start.",
      inputSchema: z.object({})
    },
    () => {
      const lines = names.map((name) => {
        const exe = config.agents[name]?.[0];
        return `${name}: ${exe && Bun.which(exe) ? "installed" : "not installed"}`;
      });
      return text(lines.join("\n"));
    }
  );

  server.registerTool(
    "run_agent",
    {
      description:
        "Hand a job to a coding agent (Claude Code, Codex, Pi, …) running on the user's computer and return its final answer. The agent works in the given folder and cannot see this chat, so describe the task completely. Can take many minutes.",
      inputSchema: z.object({
        agent: z.string().describe(`One of: ${names.join(", ")}`),
        prompt: z.string().describe("A self-contained task description"),
        cwd: z
          .string()
          .optional()
          .describe("Project folder; defaults to the first allowed folder"),
        timeoutMinutes: z.number().int().min(1).max(60).default(15)
      })
    },
    async ({ agent, prompt, cwd, timeoutMinutes }, ctx) => {
      const template = config.agents[agent];
      if (!template) {
        return failure(
          `Unknown agent ${agent}. Available: ${names.join(", ")}.`
        );
      }
      const argv = buildArgv(template, prompt);
      if (!argv) return failure(`${agent} is not installed on this device.`);
      try {
        const dir = await resolveInRoots(config.roots, cwd ?? ".");
        const result = await run(argv, {
          cwd: dir,
          timeoutMs: timeoutMinutes * 60_000,
          signal: ctx.mcpReq.signal,
          // Progress bytes keep the tunnel from closing an idle request.
          onTick: () =>
            void ctx.mcpReq.log("info", `${agent} is working`).catch(() => {})
        });
        return text(formatResult(result));
      } catch (error) {
        return failure(error);
      }
    }
  );
}
