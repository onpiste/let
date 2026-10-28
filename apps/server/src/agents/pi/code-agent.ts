import { Agent as PiAgent, type AgentTool } from "@mariozechner/pi-agent-core";
import { Type, type TSchema } from "@mariozechner/pi-ai";

import type { Sandbox } from "../../tools/sandbox";
import { workersAiModel } from "./model";

/** Bound on tool-call rounds for one coding task. */
const MAX_STEPS = 25;

const SYSTEM_PROMPT = `You are a coding agent working in a Linux sandbox (Node.js 24 on Debian, internet access, working directory /workspace). Complete the task by writing and running code with your tools. Verify your work by running it. When done, reply with a short summary: what you built or changed, the file paths, and how to run it. Do not ask questions; make reasonable assumptions.`;

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {} };
}

function sandboxTools(sandbox: DurableObjectStub<Sandbox>): AgentTool[] {
  const tool = <P extends TSchema>(t: AgentTool<P>) =>
    t as unknown as AgentTool;
  return [
    tool({
      name: "runCommand",
      label: "Run command",
      description:
        "Run a shell command (sh) in /workspace. Returns exit code, stdout and stderr.",
      parameters: Type.Object({
        command: Type.String({ description: "The shell command to run" }),
        timeoutSeconds: Type.Optional(
          Type.Number({ description: "Give up after this long (default 60)" })
        )
      }),
      execute: async (_id, { command, timeoutSeconds }) =>
        text(
          JSON.stringify(
            await sandbox.runCommand(
              command,
              Math.min(timeoutSeconds ?? 60, 300) * 1000
            )
          )
        )
    }),
    tool({
      name: "writeSandboxFile",
      label: "Write file",
      description:
        "Write a text file. Relative paths resolve against /workspace.",
      parameters: Type.Object({
        path: Type.String({ description: "File path" }),
        content: Type.String({ description: "The full file content" })
      }),
      execute: async (_id, { path, content }) =>
        text(await sandbox.writeFile(path, content))
    }),
    tool({
      name: "readSandboxFile",
      label: "Read file",
      description:
        "Read a text file. Relative paths resolve against /workspace.",
      parameters: Type.Object({
        path: Type.String({ description: "File path" })
      }),
      execute: async (_id, { path }) => text(await sandbox.readFile(path))
    })
  ];
}

/**
 * Runs one coding task to completion on the Pi harness and returns its final
 * summary. Pi has no chat of its own: Think delegates here (after the user
 * approves the task) and relays the result.
 */
export async function runCodeTask({
  env,
  sandbox,
  task,
  signal
}: {
  env: Env;
  sandbox: DurableObjectStub<Sandbox>;
  task: string;
  signal?: AbortSignal;
}) {
  const agent = new PiAgent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: workersAiModel(env),
      thinkingLevel: "off",
      tools: sandboxTools(sandbox)
    },
    getApiKey: () => env.CLOUDFLARE_API_KEY
  });
  signal?.addEventListener("abort", () => agent.abort());
  let steps = 0;
  agent.subscribe((event) => {
    if (event.type === "turn_end" && ++steps >= MAX_STEPS) agent.abort();
  });
  await agent.prompt(task);

  const messages = agent.state.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const reply = m.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    if (reply) return reply;
  }
  return "The coding agent stopped without a summary.";
}
