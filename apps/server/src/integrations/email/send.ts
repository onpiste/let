import type { EmailDraft } from "@cot/shared";

/** `<left@right>`, with no spaces, line breaks or stray brackets. */
const MESSAGE_ID = /^<[^<>@\s]+@[^<>@\s]+>$/;

/**
 * The Message-ID a reply can cite, or null: older inbox rows have none, and
 * a malformed one (or one with a line break, which would start a new
 * header) can't thread the reply.
 */
export function threadId(repliesTo: string | null) {
  return repliesTo && repliesTo.length <= 900 && MESSAGE_ID.test(repliesTo)
    ? repliesTo
    : null;
}

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
  const threadTo = threadId(repliesTo);
  const result = await binding.send({
    from,
    to: draft.to,
    subject: draft.subject,
    text: draft.body,
    ...(threadTo
      ? { headers: { "In-Reply-To": threadTo, References: threadTo } }
      : {})
  });
  return result.messageId;
}
