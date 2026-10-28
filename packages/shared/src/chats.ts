/**
 * One conversation in the history list. The assistant keeps exactly one
 * conversation active (the one Telegram and every client share); the others
 * are saved snapshots that `openChat` swaps back in.
 */
export type ChatSummary = {
  id: string;
  /** The first thing the user said, trimmed. */
  title: string;
  /** ISO timestamp of the last change. */
  updatedAt: string;
  active: boolean;
};
