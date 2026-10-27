import type { ToolSet } from "ai";

import type { Sandbox } from "../../../tools/sandbox";
import type { ReminderAgent } from "../../common/reminders";
import { memoryTools, type MemoryWriter } from "./memory";
import { reminderTools } from "./reminders";
import { researchTools } from "./research";
import { sandboxTools } from "./sandbox";

/**
 * Tools that wait for the user to approve them in the chat. Telegram has no
 * approval buttons, so these are withheld from Telegram turns.
 */
export const NEEDS_APPROVAL = new Set(["runCommand", "writeSandboxFile"]);

/** Every built-in tool of the Think assistant. MCP tools are added by Think. */
export function assistantTools({
  env,
  agent,
  memory,
  sandbox
}: {
  env: Env;
  agent: ReminderAgent;
  memory: MemoryWriter;
  sandbox: DurableObjectStub<Sandbox>;
}): ToolSet {
  return {
    ...memoryTools(memory),
    ...reminderTools(agent, env),
    ...sandboxTools(sandbox),
    ...researchTools(env)
  };
}
