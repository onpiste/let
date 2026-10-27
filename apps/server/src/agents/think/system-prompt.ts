import { getSchedulePrompt } from "agents/schedule";

import type { Settings } from "@cot/shared";

import {
  buildPersona,
  memorySection,
  REMINDER_HINT,
  type Memory
} from "../common/prompt";

/**
 * The Think assistant's system prompt. `commandsAllowed` is false for
 * Telegram turns, where the approval-gated tools are withheld.
 */
export function buildSystemPrompt({
  settings,
  memories,
  commandsAllowed
}: {
  settings: Settings;
  memories: Memory[];
  commandsAllowed: boolean;
}) {
  const sandbox = commandsAllowed
    ? "Use runCommand to run shell commands, and writeSandboxFile / readSandboxFile for files."
    : "Use readSandboxFile to read files.";
  return `${buildPersona(settings)}

${memorySection(memories)}

${getSchedulePrompt({ date: new Date() })}

${REMINDER_HINT}

For a quick calculation or data transformation, use runCode: it runs JavaScript (or Python) in an isolated, short-lived runtime with no network and no files, and returns the output in about a second. Prefer JavaScript, which starts faster.

You also have a Linux sandbox (Node.js 24 on Debian, with internet access; no Python preinstalled, install tools with apt-get) that keeps files between turns (working directory /workspace). ${sandbox} The first command after a while takes longer while the sandbox starts. Use browseWeb to open a web page and read its text. Use searchKnowledge to look things up in the user's uploaded documents.`;
}
