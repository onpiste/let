import type { ToolSet } from "ai";

import type { GoogleAccount } from "../../../integrations/google/account";
import type { Sandbox } from "../../../tools/sandbox";
import type { ReminderAgent } from "../../common/reminders";
import { googleTools } from "./google";
import { memoryTools, type MemoryWriter } from "./memory";
import { reminderTools } from "./reminders";
import { researchTools } from "./research";
import { sandboxTools } from "./sandbox";

/**
 * Tools that wait for the user to approve them in the chat. Telegram has no
 * approval buttons, so these are withheld from Telegram turns.
 */
export const NEEDS_APPROVAL = new Set([
  "runCommand",
  "writeSandboxFile",
  "sendEmail",
  "createEvent"
]);

/** Every built-in tool of the Think assistant. MCP tools are added by Think. */
export function assistantTools({
  env,
  agent,
  memory,
  sandbox,
  google
}: {
  env: Env;
  agent: ReminderAgent;
  memory: MemoryWriter;
  sandbox: DurableObjectStub<Sandbox>;
  google: GoogleAccount;
}): ToolSet {
  return {
    ...memoryTools(memory),
    ...reminderTools(agent),
    ...sandboxTools(sandbox),
    ...researchTools(env),
    ...googleTools(google)
  };
}
