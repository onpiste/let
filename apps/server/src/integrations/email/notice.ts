import type { LanguageModel } from "ai";

import { inboxPath, type ServerEvent } from "@cot/shared";

import { log } from "../../log/logger";
import type { PushAlert } from "../push";
import type { Inbox } from "./inbox";
import { triageEmail, type Triage } from "./triage";

/**
 * Reads a filed email, records what it is, and returns the notice for the
 * owner (without the summary if the model couldn't read it).
 */
export async function triagedNotice(
  inbox: Inbox,
  model: () => LanguageModel,
  id: number
) {
  const email = inbox.get(id);
  if (!email) return null;
  let triage: Triage | null = null;
  try {
    triage = await triageEmail(model(), email);
    inbox.setTriage(id, triage.category, triage.summary);
  } catch (error) {
    // Still tell the owner, just without the summary.
    log.error("email", "Triage failed", error);
  }
  log.info("email", "Triaged", { id, category: triage?.category ?? null });
  return emailNotice({
    ...email,
    unread: inbox.unreadCount(),
    triage,
    preview: null
  });
}

/**
 * What the owner is told about a new email: the event for open clients, and
 * the text for Telegram and the phone's alert, or null when it needn't
 * interrupt them (spam and bulk mail just wait in the inbox, counted in
 * the unread badge). The alert opens the email when tapped.
 */
export function emailNotice({
  id,
  unread,
  from,
  subject,
  trusted,
  triage,
  preview
}: {
  id: number;
  unread: number;
  from: string;
  subject: string;
  trusted: boolean;
  triage: Triage | null;
  /** Text to pass on as is, for Gmail's forwarding confirmation. */
  preview: string | null;
}): {
  event: ServerEvent;
  push: { text: string; alert: PushAlert } | null;
} {
  const event: ServerEvent = {
    type: "email",
    id,
    unread,
    from,
    subject,
    trusted,
    category: triage?.category,
    summary: triage?.summary,
    timestamp: new Date().toISOString()
  };
  if (triage?.category === "ignore") return { event, push: null };
  const sender = trusted ? from : `${from} (unknown sender)`;
  const heading =
    triage?.category === "action" ? "⚠️ Needs your action" : "📧 New email";
  const detail = triage?.summary ?? preview;
  return {
    event,
    push: {
      text: `${heading} from ${sender}\n${subject}${detail ? `\n\n${detail}` : ""}`,
      alert: {
        title: `${heading} from ${sender}`,
        body: detail ? `${subject}\n${detail}` : subject,
        path: inboxPath(id)
      }
    }
  };
}
