import { canonicalSender } from "./config";

/** Gmail sends the confirmation for a new forwarding address from here. */
const GMAIL_FORWARDING_SENDER = "forwarding-noreply@google.com";

export type EmailDecision =
  | { kind: "accept" }
  /** Gmail asking to confirm forwarding; show it to the owner as is. */
  | { kind: "forwarding-confirmation" }
  | { kind: "reject" };

/**
 * Who may reach the assistant by email: the owner and the senders they
 * allowed. Email Routing has already rejected mail that fails SPF/DKIM or
 * the sender's DMARC policy, so the envelope sender can be trusted this far.
 * Anything else is dropped, because every accepted email is text the model
 * may later read.
 */
export function gateEmail({
  envelopeFrom,
  headerFrom,
  owner,
  allowedSenders
}: {
  envelopeFrom: string;
  /** The From header's address; google.com's DMARC policy protects it. */
  headerFrom: string | null;
  owner: string | null;
  allowedSenders: string[];
}): EmailDecision {
  const sender = canonicalSender(envelopeFrom);
  if (!owner) return { kind: "reject" };
  if (headerFrom && canonicalSender(headerFrom) === GMAIL_FORWARDING_SENDER) {
    return { kind: "forwarding-confirmation" };
  }
  const allowed = new Set([
    canonicalSender(owner),
    ...allowedSenders.map(canonicalSender)
  ]);
  return allowed.has(sender) ? { kind: "accept" } : { kind: "reject" };
}
