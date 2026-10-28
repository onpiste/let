import type { ToolSet } from "ai";

import type { Inbox } from "../../../integrations/email/inbox";
import type { Sandbox } from "../../../tools/sandbox";
import type { ReminderAgent } from "../../common/reminders";
import { codeTools } from "./code";
import { emailTools } from "./email";
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
  "codeTask"
]);

/** Every built-in tool of the Think assistant. MCP tools are added by Think. */
export function assistantTools({
  env,
  agent,
  memory,
  sandbox,
  inbox
}: {
  env: Env;
  agent: ReminderAgent;
  memory: MemoryWriter;
  sandbox: DurableObjectStub<Sandbox>;
  /** The assistant's inbox, when it has an email address. */
  inbox: (() => Inbox) | null;
}): ToolSet {
  return {
    ...memoryTools(memory),
    ...reminderTools(agent, env),
    ...sandboxTools(sandbox),
    ...codeTools(env, sandbox),
    ...researchTools(env),
    ...(inbox ? emailTools(inbox) : {})
  };
}
