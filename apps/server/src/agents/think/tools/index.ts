import type { ToolSet } from "ai";

import type { ApprovalMode, Skill } from "@cot/shared";

import type { Sandbox } from "../../../tools/sandbox";
import { chatTools, type ChatReader } from "./chats";
import { codeTools } from "./code";
import { emailTools, type InboxReader } from "./email";
import type { MemoryWriter } from "./memory";
import { memoryTools } from "./memory";
import { reminderTools, type Reminders } from "./reminders";
import { researchTools } from "./research";
import { sandboxTools } from "./sandbox";
import { skillTools } from "./skills";
import { webTools, type WebAccess } from "./web";

/**
 * Tools that wait for the user to approve them in the chat. Telegram has no
 * approval buttons, so these are withheld from Telegram turns.
 */
export const NEEDS_APPROVAL = new Set([
  "runCommand",
  "writeSandboxFile",
  "codeTask"
]);

/** Tools a chat runs itself: stateless ones and the user's sandbox. */
export function localTools({
  env,
  sandbox,
  approvalMode
}: {
  env: Env;
  sandbox: DurableObjectStub<Sandbox>;
  approvalMode: () => ApprovalMode;
}): ToolSet {
  return {
    ...sandboxTools(sandbox, approvalMode),
    ...codeTools(env, sandbox, approvalMode),
    ...researchTools(env)
  };
}

/** What the assistant does for its chats (see chat-services.ts). */
export type AssistantServices = MemoryWriter &
  ChatReader &
  Reminders &
  WebAccess &
  InboxReader;

/**
 * Tools whose state lives in the assistant (memory, reminders, saved chats,
 * Gemini limits, the inbox): each call goes back to it over RPC. The flags
 * come from the turn's setup, so a tool is only offered when it works.
 */
export function assistantTools(
  services: AssistantServices,
  setup: { skills: Skill[]; webSearch: boolean; email: boolean }
): ToolSet {
  return {
    ...memoryTools(services),
    ...chatTools(services),
    ...reminderTools(services),
    ...(setup.webSearch ? webTools(services) : {}),
    ...(setup.skills.length ? skillTools(setup.skills) : {}),
    ...(setup.email ? emailTools(services) : {})
  };
}
