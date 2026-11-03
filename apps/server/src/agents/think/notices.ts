import type { Agent } from "agents";

import type { ServerEvent } from "@cot/shared";

import type { OwnerPush, PushAlert } from "../../integrations/push";
import type { TelegramChannel } from "../../integrations/telegram/channel";

/** Something to tell the owner; a null `push` keeps it to open clients. */
type OwnerNotice = {
  event: ServerEvent;
  push: { text: string; alert: PushAlert } | null;
};

/** Telegram takes at most 4096 characters a message. */
const TEXT_MAX = 3500;
/** A push alert shows a few lines, and APNs caps the payload at 4 KB. */
const ALERT_MAX = 300;

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A scheduled task fired; `reply` is what the assistant made of it. */
export function reminderNotice(
  description: string,
  reply: string | null
): OwnerNotice {
  return {
    event: {
      type: "reminder",
      description,
      timestamp: new Date().toISOString()
    },
    push: reply
      ? {
          text: clip(`⏰ ${description}\n\n${reply}`, TEXT_MAX),
          alert: {
            title: clip(`⏰ ${description}`, 80),
            body: clip(reply, ALERT_MAX)
          }
        }
      : {
          text: `⏰ Reminder: ${description}`,
          alert: { title: "⏰ Reminder", body: description }
        }
  };
}

export function researchNotice(topic: string, ok: boolean): OwnerNotice {
  const title = ok ? "🔎 Research ready" : "🔎 Research failed";
  return {
    event: {
      type: "research",
      topic,
      ok,
      timestamp: new Date().toISOString()
    },
    push: { text: `${title}: ${topic}`, alert: { title, body: topic } }
  };
}

/**
 * Tells the owner on every channel: open clients get the event, Telegram the
 * text, phones and browsers the alert. A broadcast rather than a chat message, so a
 * notice never enters the history or starts a model turn.
 */
export async function notifyOwner(
  agent: Pick<Agent<Env>, "broadcast">,
  channels: { telegram: TelegramChannel; push: OwnerPush },
  notice: OwnerNotice
) {
  agent.broadcast(JSON.stringify(notice.event));
  if (!notice.push) return;
  await Promise.all([
    channels.telegram.notify(notice.push.text),
    channels.push.notify(notice.push.alert)
  ]);
}
