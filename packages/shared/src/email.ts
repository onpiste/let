/** Who may email the assistant. */
/**
 * How the assistant sorted a new email: `action` needs the owner to do
 * something, `notify` is worth knowing about, `ignore` is spam or bulk mail.
 */
export type EmailCategory = "action" | "notify" | "ignore";

/** One email in the inbox list. */
export type EmailSummary = {
  id: number;
  receivedAt: string;
  from: string;
  /** From the owner or a trusted sender rather than a stranger. */
  trusted: boolean;
  subject: string;
  /** How the assistant sorted it; null until (or unless) it has. */
  category: EmailCategory | null;
  summary: string | null;
  /** Opened by the owner on a client. */
  read: boolean;
  archived: boolean;
};

/** One email as the owner reads it. The body is plain text. */
export type EmailDetail = EmailSummary & {
  /** The Date header, if the sender set one. */
  date: string | null;
  body: string;
  /** File names; the files themselves aren't kept. */
  attachments: string[];
};

/** A page of the inbox (or of the archive), newest first. */
export type InboxPage = {
  emails: EmailSummary[];
  /** Older mail is left to page through with a larger offset. */
  more: boolean;
  /** Unread mail outside the archive, for the badge. */
  unread: number;
};

/** How many emails one `listInbox` call returns. */
export const INBOX_PAGE_SIZE = 30;

/**
 * The web path that opens the inbox, or one email in it. Push alerts carry
 * it so a tap lands on the email (the iOS app reads the same path).
 */
export function inboxPath(id?: number) {
  return id === undefined ? "/inbox" : `/inbox/${id}`;
}

/** The email id in an inbox path, or null for the list or another path. */
export function emailIdFromPath(path: string): number | null {
  const match = /^\/inbox\/(\d+)$/.exec(path);
  return match?.[1] ? Number(match[1]) : null;
}

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

/** An email the assistant sends for the owner, once they approve it. */
export type EmailDraft = {
  to: string;
  subject: string;
  /** Plain text. */
  body: string;
  /** The inbox email this answers, for threading; omitted for new mail. */
  inReplyTo?: number;
};

/** Longest subject and body a draft may have. */
export const EMAIL_DRAFT_LIMITS = { subject: 200, body: 20_000 } as const;

/**
 * Validates a draft that came from a model's tool call: one plain address,
 * a non-empty subject and body within the limits.
 */
export function normalizeEmailDraft(draft: unknown): EmailDraft {
  if (typeof draft !== "object" || draft === null) {
    throw new Error("Expected an email draft.");
  }
  const { to, subject, body, inReplyTo } = draft as Record<string, unknown>;
  const [address, ...rest] = normalizeSenders([to]);
  if (!address || rest.length > 0) throw new Error("Give one address in to.");
  if (typeof subject !== "string" || !subject.trim()) {
    throw new Error("The email needs a subject.");
  }
  if (typeof body !== "string" || !body.trim()) {
    throw new Error("The email needs a body.");
  }
  if (subject.length > EMAIL_DRAFT_LIMITS.subject) {
    throw new Error("The subject is too long.");
  }
  if (body.length > EMAIL_DRAFT_LIMITS.body) {
    throw new Error("The body is too long.");
  }
  if (
    inReplyTo !== undefined &&
    (typeof inReplyTo !== "number" || !Number.isSafeInteger(inReplyTo))
  ) {
    throw new Error("inReplyTo must be an email id.");
  }
  return {
    to: address,
    // A newline in a subject would start a new header.
    subject: subject.replace(/[\r\n]+/g, " ").trim(),
    body,
    ...(inReplyTo === undefined ? {} : { inReplyTo })
  };
}
