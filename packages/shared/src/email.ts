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
      /** The address mail reaches the assistant at: `alias@domain`. */
      address: string;
      alias: string;
      domain: string;
    } & EmailPolicy);

/**
 * Addresses nobody can take: mailbox roles other services expect to reach
 * the domain's operator (RFC 2142 and common equivalents).
 */
const RESERVED_ALIASES = new Set([
  "abuse",
  "admin",
  "administrator",
  "dmarc",
  "hostmaster",
  "info",
  "mailer-daemon",
  "no-reply",
  "noreply",
  "postmaster",
  "root",
  "security",
  "support",
  "webmaster"
]);

const ALIAS_PATTERN = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;

/**
 * Validates the part of the address before the @: 3–32 lower-case letters,
 * digits, dots, hyphens or underscores, starting and ending with a letter or
 * digit. `+` is left out because it starts a tag (`alias+news@…`).
 */
export function normalizeAlias(alias: unknown): string {
  if (typeof alias !== "string") throw new Error("Expected an address.");
  const value = alias.trim().toLowerCase();
  if (!ALIAS_PATTERN.test(value) || value.includes("..")) {
    throw new Error(
      "Use 3–32 letters, digits, dots, hyphens or underscores, starting and ending with a letter or digit."
    );
  }
  if (RESERVED_ALIASES.has(value)) throw new Error(`${value} is reserved.`);
  return value;
}

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
