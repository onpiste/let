import { homedir } from "node:os";

import type { JsonStore } from "../json-store";

type CalendarBackendName = "auto" | "macos" | "outlook" | "ics" | "khal";

/**
 * What this computer lets the assistant do. It is stored on the device and
 * only the settings window changes it, never a tool call: that is what makes
 * it safe to run without per-command approval in the chat.
 */
export type Policy = {
  /** Files are only readable and writable under these folders. */
  roots: string[];
  /** Off keeps files, calendar and agents but removes raw commands. */
  allowShell: boolean;
  /**
   * Coding agents the assistant may start, by name. `{prompt}` is replaced by
   * the task. Add an entry to expose another CLI.
   */
  agents: Record<string, string[]>;
  calendar: CalendarBackendName;
  /** Calendar file for the "ics" backend; must be inside `roots`. */
  icsPath: string;
  /** Programs `list_tools` reports on. */
  probe: string[];
};

export function defaultPolicy(): Policy {
  return {
    roots: [homedir()],
    allowShell: true,
    agents: {
      claude: ["claude", "-p", "{prompt}", "--permission-mode", "acceptEdits"],
      codex: ["codex", "exec", "{prompt}"],
      pi: ["pi", "-p", "{prompt}"]
    },
    calendar: "auto",
    icsPath: `${homedir()}/Calendar/cot.ics`,
    probe: ["ffmpeg", "magick", "convert", "pandoc", "khal", "git", "python3"]
  };
}

export type PolicyStore = JsonStore<Policy>;
