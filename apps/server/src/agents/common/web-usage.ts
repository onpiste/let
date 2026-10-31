import { limit } from "./usage";

/** What the deployment's Gemini access is spent on. */
type WebUse = "search" | "research";

/** Today's searches and Deep Research runs on the deployment's key. */
export type WebUsageRecord = { day: string } & Record<WebUse, number>;

export type WebUsageStore = {
  getWebUsage(): WebUsageRecord | null;
  saveWebUsage(record: WebUsageRecord): void;
};

const LABELS: Record<WebUse, string> = {
  search: "web searches",
  research: "deep research runs"
};

/**
 * Counts one use of the deployment's Gemini access against the account's
 * daily limit (DAILY_SEARCH_LIMIT / DAILY_RESEARCH_LIMIT; 0 means none).
 * Returns a refusal for the model to pass on when the limit is reached.
 */
export function takeWebUse(env: Env, store: WebUsageStore, use: WebUse) {
  const max = limit(
    use === "search" ? env.DAILY_SEARCH_LIMIT : env.DAILY_RESEARCH_LIMIT
  );
  const day = new Date().toISOString().slice(0, 10);
  const saved = store.getWebUsage();
  const today: WebUsageRecord =
    saved?.day === day ? saved : { day, search: 0, research: 0 };
  if (max && today[use] >= max) {
    return `Today's limit of ${max} ${LABELS[use]} on the shared Gemini access is used up; it resets at 00:00 UTC. The user can add their own Google key in Settings to keep going.`;
  }
  store.saveWebUsage({ ...today, [use]: today[use] + 1 });
  return null;
}
