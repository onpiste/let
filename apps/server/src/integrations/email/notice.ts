import type { ServerEvent } from "@cot/shared";

import type { PushAlert } from "../push";
import type { Triage } from "./triage";

/**
 * What the owner is told about a new email: the event for open clients, and
 * the text for Telegram and the phone's alert, or null when it needn't
 * interrupt them (spam and bulk mail just wait in the inbox).
 */
export function emailNotice({
  from,
  subject,
  trusted,
  triage,
  preview
}: {
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
        body: detail ? `${subject}\n${detail}` : subject
      }
    }
  };
}
