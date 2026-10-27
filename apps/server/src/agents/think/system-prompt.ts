import { getSchedulePrompt } from "agents/schedule";

import type { Settings } from "@cot/shared";

import {
  buildPersona,
  memorySection,
  SCHEDULE_HINT,
  timeNote,
  type Memory
} from "../common/prompt";

const SCHEDULED_TURN =
  "This turn was started by a scheduled task the user set up earlier, not typed by them now. Carry out the task and reply with the result; your reply is sent to the user as a notification.";

/**
 * The Think assistant's system prompt. `commandsAllowed` is false for
 * Telegram turns and scheduled tasks, where the approval-gated tools are
 * withheld; `scheduled` marks a scheduled task's turn.
 */
export function buildSystemPrompt({
  settings,
  memories,
  timezone,
  commandsAllowed,
  scheduled = false
}: {
  settings: Settings;
  memories: Memory[];
  timezone: string | null;
  commandsAllowed: boolean;
  scheduled?: boolean;
}) {
  const sandbox = commandsAllowed
    ? "Use runCommand to run shell commands, and writeSandboxFile / readSandboxFile for files."
    : "Use readSandboxFile to read files.";
  return `${buildPersona(settings)}

${memorySection(memories)}

${getSchedulePrompt({ date: new Date() })}

${timeNote(timezone)}

${SCHEDULE_HINT}${scheduled ? `\n\n${SCHEDULED_TURN}` : ""}

For a quick calculation or data transformation, use runCode: it runs JavaScript (or Python) in an isolated, short-lived runtime with no network and no files, and returns the output in about a second. Prefer JavaScript, which starts faster.

You also have a Linux sandbox (Node.js 24 on Debian, with internet access; no Python preinstalled, install tools with apt-get) that keeps files between turns (working directory /workspace). ${sandbox} The first command after a while takes longer while the sandbox starts. Use browseWeb to open a web page and read its text. Use searchKnowledge to look things up in the user's uploaded documents.`;
}
