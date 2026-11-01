/** A Deep Research run still going on Google's side. */
export type ResearchJob = {
  id: string;
  /** The brief the run was started with. */
  topic: string;
  /** Epoch milliseconds. */
  startedAt: number;
  /** Gemini's latest thought summary, when a poll includes one. */
  progress: string | null;
  /** Why the latest checks failed; null while they succeed. */
  problem: string | null;
};
