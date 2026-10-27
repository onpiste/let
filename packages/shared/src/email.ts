/** What a client sees of the assistant's own email address. */
export type EmailStatus =
  | { enabled: false }
  | {
      enabled: true;
      /** The address mail reaches the assistant at. */
      address: string;
      /** Besides the owner, who may send to it. */
      allowedSenders: string[];
    };

export const MAX_ALLOWED_SENDERS = 20;

const EMAIL_PATTERN = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

/**
 * Trims, lower-cases and de-duplicates a sender list, throwing on anything
 * that isn't a plain address. The list comes from the network.
 */
export function normalizeSenders(senders: unknown): string[] {
  if (!Array.isArray(senders)) throw new Error("Expected a list of emails.");
  const normalized = new Set<string>();
  for (const sender of senders) {
    if (typeof sender !== "string") throw new Error("Expected an email.");
    const email = sender.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      throw new Error(`${email} is not an email address.`);
    }
    normalized.add(email);
  }
  if (normalized.size > MAX_ALLOWED_SENDERS) {
    throw new Error(`Allow at most ${MAX_ALLOWED_SENDERS} senders.`);
  }
  return [...normalized];
}
