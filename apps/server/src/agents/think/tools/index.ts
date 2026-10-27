import type { ToolSet } from "ai";

import type { Sandbox } from "../../../tools/sandbox";
import { memoryTools, type MemoryWriter } from "./memory";
import { researchTools } from "./research";
import { sandboxTools } from "./sandbox";
import { scheduleTools, type JobScheduler } from "./schedule";

/**
 * Tools that wait for the user to approve them in the chat. Telegram turns
 * and scheduled tasks have nobody to approve them, so they go without.
 */
export const NEEDS_APPROVAL = new Set(["runCommand", "writeSandboxFile"]);

/** Every built-in tool of the Think assistant. MCP tools are added by Think. */
export function assistantTools({
  env,
  jobs,
  memory,
  sandbox
}: {
  env: Env;
  jobs: JobScheduler;
  memory: MemoryWriter;
  sandbox: DurableObjectStub<Sandbox>;
}): ToolSet {
  return {
    ...memoryTools(memory),
    ...scheduleTools(jobs),
    ...sandboxTools(sandbox),
    ...researchTools(env)
  };
}
