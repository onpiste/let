/**
 * Message timestamps. Every client stamps the messages it sends, and the
 * server stamps assistant replies, as `metadata.createdAt` (epoch ms). Older
 * messages have none, so every helper treats a missing stamp as unknown.
 */

/** A time divider appears when two messages are at least this far apart. */
export const TIME_DIVIDER_GAP_MS = 15 * 60 * 1000;

/** The `createdAt` of an AI SDK message's metadata, if it has a valid one. */
export function messageCreatedAt(message: {
  metadata?: unknown;
}): number | undefined {
  const meta = message.metadata;
  if (typeof meta !== "object" || meta === null) return undefined;
  const value = (meta as { createdAt?: unknown }).createdAt;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** Whether to show the time between a message and the one before it. */
export function needsTimeDivider(
  previous: number | undefined,
  current: number | undefined
): boolean {
  if (previous === undefined || current === undefined) return false;
  return current - previous >= TIME_DIVIDER_GAP_MS;
}
