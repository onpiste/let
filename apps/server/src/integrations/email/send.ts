import type { EmailDraft } from "@cot/shared";

/**
 * Sends one plain-text email from the assistant's address. The binding is
 * called directly rather than through the Agents SDK's `sendAgentEmail`,
 * whose X-Agent-* headers would put the instance name (`google:<sub>`) in
 * every message; replies come back by alias anyway (handler.ts).
 */
export async function sendEmail({
  binding,
  from,
  draft,
  repliesTo
}: {
  binding: SendEmail;
  from: { email: string; name: string };
  draft: EmailDraft;
  /** The Message-ID of the email this answers, to thread the reply. */
  repliesTo: string | null;
}) {
  const result = await binding.send({
    from,
    to: draft.to,
    subject: draft.subject,
    text: draft.body,
    ...(repliesTo
      ? { headers: { "In-Reply-To": repliesTo, References: repliesTo } }
      : {})
  });
  return result.messageId;
}
