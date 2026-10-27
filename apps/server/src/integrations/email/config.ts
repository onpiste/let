import type { EmailPolicy, EmailStatus } from "@cot/shared";

/** The assistant's address and who may use it, stored in its agent. */
export type EmailConfig = EmailPolicy & { alias: string };

/** New addresses take mail from anyone, marking strangers as such. */
export const DEFAULT_POLICY: EmailPolicy = {
  acceptFromAnyone: true,
  trustedSenders: []
};

const ALIAS_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const ALIAS_LENGTH = 12;

/** A random, unambiguous alias such as `k7f3q9xm2hta`. */
export function newAlias() {
  const bytes = crypto.getRandomValues(new Uint8Array(ALIAS_LENGTH));
  return Array.from(
    bytes,
    (b) => ALIAS_ALPHABET[b % ALIAS_ALPHABET.length]
  ).join("");
}

/**
 * The alias a recipient address is for: the local part without any
 * `+tag`, lower-cased. Null when it isn't on our domain.
 */
export function aliasFor(recipient: string, domain: string) {
  const [local, host] = recipient.toLowerCase().split("@");
  if (!local || host !== domain.toLowerCase()) return null;
  return local.split("+")[0] ?? null;
}

/**
 * A sender address in comparable form. Gmail's auto-forwarding sends from
 * `you+caf_=…@gmail.com`, so the `+tag` is dropped.
 */
export function canonicalSender(address: string) {
  const [local = "", host = ""] = address.trim().toLowerCase().split("@");
  return `${local.split("+")[0]}@${host}`;
}

export function toEmailStatus(
  config: EmailConfig | null,
  domain: string
): EmailStatus {
  if (!config || !domain) return { enabled: false };
  return {
    enabled: true,
    address: `${config.alias}@${domain}`,
    acceptFromAnyone: config.acceptFromAnyone,
    trustedSenders: config.trustedSenders
  };
}
