/** Who may email the assistant. */
export type EmailPolicy = {
  /** Accept mail from strangers too, marked as from an unknown sender. */
  acceptFromAnyone: boolean;
  /** Besides the owner, senders whose mail is trusted. */
  trustedSenders: string[];
};

/** What a client sees of the assistant's own email address. */
export type EmailStatus =
  | { enabled: false }
  | ({
      enabled: true;
      /** The address mail reaches the assistant at. */
      address: string;
    } & EmailPolicy);

export const MAX_TRUSTED_SENDERS = 20;

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
  if (normalized.size > MAX_TRUSTED_SENDERS) {
    throw new Error(`Trust at most ${MAX_TRUSTED_SENDERS} senders.`);
  }
  return [...normalized];
}

/** Validates a policy that came from the network. */
export function normalizeEmailPolicy(policy: unknown): EmailPolicy {
  if (typeof policy !== "object" || policy === null) {
    throw new Error("Expected an email policy.");
  }
  const { acceptFromAnyone, trustedSenders } = policy as Record<
    string,
    unknown
  >;
  if (typeof acceptFromAnyone !== "boolean") {
    throw new Error("acceptFromAnyone must be true or false.");
  }
  return { acceptFromAnyone, trustedSenders: normalizeSenders(trustedSenders) };
}
