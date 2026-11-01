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

/** Today's record, starting a fresh one on a new UTC day. */
function today(store: WebUsageStore): WebUsageRecord {
  const day = new Date().toISOString().slice(0, 10);
  const saved = store.getWebUsage();
  return saved?.day === day ? saved : { day, search: 0, research: 0 };
}

/**
 * A refusal for the model to pass on when the account has used up today's
 * shared Gemini access (DAILY_SEARCH_LIMIT / DAILY_RESEARCH_LIMIT; 0 means
 * none), else null. Only checks; count a use with `countWebUse` once Google
 * has accepted it, so failed calls don't eat the allowance.
 */
export function webUseRefusal(env: Env, store: WebUsageStore, use: WebUse) {
  const max = limit(
    use === "search" ? env.DAILY_SEARCH_LIMIT : env.DAILY_RESEARCH_LIMIT
  );
  if (!max || today(store)[use] < max) return null;
  return `Today's limit of ${max} ${LABELS[use]} on the shared Gemini access is used up; it resets at 00:00 UTC. The user can add their own Google key in Settings to keep going.`;
}

export function countWebUse(store: WebUsageStore, use: WebUse) {
  const record = today(store);
  store.saveWebUsage({ ...record, [use]: record[use] + 1 });
}
