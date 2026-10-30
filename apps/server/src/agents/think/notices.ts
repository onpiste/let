import type { Agent } from "agents";

import type { ServerEvent } from "@cot/shared";

import type { PushChannel } from "../../integrations/apns/channel";
import type { PushAlert } from "../../integrations/apns/send";
import type { TelegramChannel } from "../../integrations/telegram/channel";

/** Something to tell the owner; a null `push` keeps it to open clients. */
type OwnerNotice = {
  event: ServerEvent;
  push: { text: string; alert: PushAlert } | null;
};

export function reminderNotice(description: string): OwnerNotice {
  return {
    event: {
      type: "reminder",
      description,
      timestamp: new Date().toISOString()
    },
    push: {
      text: `⏰ Reminder: ${description}`,
      alert: { title: "⏰ Reminder", body: description }
    }
  };
}

/**
 * Tells the owner on every channel: open clients get the event, Telegram the
 * text, phones the alert. A broadcast rather than a chat message, so a
 * notice never enters the history or starts a model turn.
 */
export async function notifyOwner(
  agent: Pick<Agent<Env>, "broadcast">,
  channels: { telegram: TelegramChannel; push: PushChannel },
  notice: OwnerNotice
) {
  agent.broadcast(JSON.stringify(notice.event));
  if (!notice.push) return;
  await Promise.all([
    channels.telegram.notify(notice.push.text),
    channels.push.notify(notice.push.alert)
  ]);
}
