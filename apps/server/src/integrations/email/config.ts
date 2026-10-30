import {
  normalizeAlias,
  type EmailPolicy,
  type EmailStatus
} from "@cot/shared";

/** The assistant's address and who may use it, stored in its agent. */
export type EmailConfig = EmailPolicy & { alias: string };

/** New addresses take mail from anyone, marking strangers as such. */
export const DEFAULT_POLICY: EmailPolicy = {
  acceptFromAnyone: true,
  trustedSenders: []
};

const ALIAS_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const ALIAS_LENGTH = 12;

/** A random, unambiguous alias such as `k7f3q9xm2hta`: the last resort. */
export function newAlias() {
  const bytes = crypto.getRandomValues(new Uint8Array(ALIAS_LENGTH));
  return Array.from(
    bytes,
    (b) => ALIAS_ALPHABET[b % ALIAS_ALPHABET.length]
  ).join("");
}

/** `Shixin Guo` → `shixin.guo`; null when nothing valid is left. */
function slug(text: string) {
  const value = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 32)
    .replace(/\.+$/, "");
  try {
    return normalizeAlias(value);
  } catch {
    return null;
  }
}

/**
 * Aliases to try, in order, for a new address: the owner's Google name,
 * their email's local part, then each with a number appended.
 */
export function aliasCandidates(name: string | null, email: string | null) {
  const bases = [
    name ? slug(name) : null,
    email ? slug(email.split("@")[0]?.split("+")[0] ?? "") : null
  ].filter((base, i, all): base is string => !!base && all.indexOf(base) === i);
  const numbered = bases.flatMap((base) =>
    Array.from({ length: 98 }, (_, i) => `${base.slice(0, 30)}${i + 2}`)
  );
  return [...bases, ...numbered];
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
    alias: config.alias,
    domain,
    acceptFromAnyone: config.acceptFromAnyone,
    trustedSenders: config.trustedSenders
  };
}

/** The assistant's own address, or null when email isn't set up. */
export function emailAddress(config: EmailConfig | null, domain: string) {
  const status = toEmailStatus(config, domain);
  return status.enabled ? status.address : null;
}
