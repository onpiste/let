import type { EmailPolicy } from "@cot/shared";

import { canonicalSender } from "./config";

/** Gmail sends the confirmation for a new forwarding address from here. */
const GMAIL_FORWARDING_SENDER = "forwarding-noreply@google.com";

export type EmailDecision =
  /** `trusted`: from the owner or a trusted sender, not a stranger. */
  | { kind: "accept"; trusted: boolean }
  /** Gmail asking to confirm forwarding; show it to the owner as is. */
  | { kind: "forwarding-confirmation" }
  | { kind: "reject" };

/**
 * Who may reach the assistant by email. The owner and their trusted senders
 * always may; strangers only when the policy accepts anyone, and their mail
 * is marked untrusted. Email Routing has already rejected mail that fails
 * SPF/DKIM or the sender's DMARC policy, so the envelope sender can be
 * trusted this far.
 */
export function gateEmail({
  envelopeFrom,
  headerFrom,
  owner,
  policy
}: {
  envelopeFrom: string;
  /** The From header's address; google.com's DMARC policy protects it. */
  headerFrom: string | null;
  owner: string | null;
  policy: EmailPolicy;
}): EmailDecision {
  const sender = canonicalSender(envelopeFrom);
  // Without an allowed owner there is nobody to read the mail.
  if (!owner) return { kind: "reject" };
  if (headerFrom && canonicalSender(headerFrom) === GMAIL_FORWARDING_SENDER) {
    return { kind: "forwarding-confirmation" };
  }
  const trusted = new Set([
    canonicalSender(owner),
    ...policy.trustedSenders.map(canonicalSender)
  ]);
  if (trusted.has(sender)) return { kind: "accept", trusted: true };
  return policy.acceptFromAnyone
    ? { kind: "accept", trusted: false }
    : { kind: "reject" };
}
