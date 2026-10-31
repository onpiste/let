/**
 * Per-account message limits, counted in the account's Think assistant; the limits come from `vars` in wrangler.jsonc, where 0 (or an
 * unset var) means no limit.
 */

export type UsageRecord = {
  /** UTC date (YYYY-MM-DD) that `count` belongs to. */
  day: string;
  count: number;
  /** Timestamps (ms) of the turns in the last minute. */
  recent: number[];
};

type UsageLimits = { perDay: number; perMinute: number };

const MINUTE_MS = 60_000;

function limit(value: string | undefined) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function usageLimits(env: Env): UsageLimits {
  return {
    perDay: limit(env.DAILY_MESSAGE_LIMIT),
    perMinute: limit(env.MINUTE_MESSAGE_LIMIT)
  };
}

/**
 * Counts one turn against the limits. Returns the updated record, or a
 * refusal to show the user when the turn is over a limit (and isn't counted).
 */
function takeTurn(
  record: UsageRecord | null,
  limits: UsageLimits,
  now = Date.now()
): { record: UsageRecord; refusal: string | null } {
  const day = new Date(now).toISOString().slice(0, 10);
  const current: UsageRecord = {
    day,
    count: record?.day === day ? record.count : 0,
    recent: (record?.recent ?? []).filter((t) => now - t < MINUTE_MS)
  };

  if (limits.perMinute && current.recent.length >= limits.perMinute) {
    return {
      record: current,
      refusal: `You're sending messages too quickly (limit: ${limits.perMinute} per minute). Wait a moment and try again.`
    };
  }
  if (limits.perDay && current.count >= limits.perDay) {
    return {
      record: current,
      refusal: `You've reached today's limit of ${limits.perDay} messages on the shared model. It resets at 00:00 UTC. To keep going now, add your own OpenAI, Anthropic or Google key in Settings → Model.`
    };
  }
  return {
    record: {
      day,
      count: current.count + 1,
      recent: [...current.recent, now]
    },
    refusal: null
  };
}

/**
 * Counts a turn against the account's message limits. Turns on the user's
 * own API key are free to the deployment, so they aren't limited. Returns a
 * refusal to show instead of answering.
 */
export function countTurn(
  store: {
    ensureTables(): void;
    getUsage(): UsageRecord | null;
    saveUsage(record: UsageRecord): void;
  },
  env: Env,
  paid: boolean
) {
  if (paid) return null;
  store.ensureTables();
  const { record, refusal } = takeTurn(store.getUsage(), usageLimits(env));
  store.saveUsage(record);
  return refusal;
}
