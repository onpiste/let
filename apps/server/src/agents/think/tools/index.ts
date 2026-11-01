import type { ToolSet } from "ai";

import type { ApprovalMode } from "@cot/shared";

import type { Inbox } from "../../../integrations/email/inbox";
import type { Sandbox } from "../../../tools/sandbox";
import type { ReminderAgent } from "../../common/reminders";
import type { ResearchJobs } from "../research-jobs";
import { chatTools, type ChatReader } from "./chats";
import { codeTools } from "./code";
import { emailTools } from "./email";
import { memoryTools, type MemoryWriter } from "./memory";
import { reminderTools } from "./reminders";
import { researchTools } from "./research";
import { sandboxTools } from "./sandbox";
import { skillTools, type SkillReader } from "./skills";
import { webTools } from "./web";

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
  chats,
  sandbox,
  inbox,
  approvalMode,
  skills,
  research
}: {
  env: Env;
  agent: ReminderAgent;
  memory: MemoryWriter;
  /** Saved conversations, searchable by the model. */
  chats: ChatReader;
  sandbox: DurableObjectStub<Sandbox>;
  /** The assistant's inbox, when it has an email address. */
  inbox: (() => Inbox) | null;
  approvalMode: () => ApprovalMode;
  skills: SkillReader;
  /** Deep Research runs; a Gemini key also turns on web search. */
  research: ResearchJobs;
}): ToolSet {
  const geminiKey = research.key();
  return {
    ...memoryTools(memory),
    ...chatTools(chats),
    ...reminderTools(agent, env),
    ...sandboxTools(sandbox, approvalMode),
    ...codeTools(env, sandbox, approvalMode),
    ...researchTools(env),
    ...(geminiKey ? webTools(env, geminiKey, research) : {}),
    ...(skills.list().length ? skillTools(skills) : {}),
    ...(inbox ? emailTools(inbox) : {})
  };
}
