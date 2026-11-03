import type { Agent } from "agents";
import type { LanguageModel, UIMessage } from "ai";

import { EmailChannel, type EmailConfigStore } from "./channel";
import { emailAddress } from "./config";
import { Inbox } from "./inbox";
import { Mailbox } from "./mailbox";
import { emailNotice, triagedNotice } from "./notice";

type Notice = ReturnType<typeof emailNotice>;

/**
 * The assistant's email, put together from its parts: the address and
 * receiving (`EmailChannel`), the inbox, triage, and what the owner does
 * from a client (`Mailbox`). The assistant hands in what it owns.
 */
export class EmailFeature {
  constructor(
    private readonly host: {
      env: Env;
      /** Named `google:<sub>` after the account that owns it. */
      agent: Pick<Agent<Env>, "sql" | "broadcast" | "name">;
      store: EmailConfigStore & { getOwnerName(): string | null };
      /** The owner's email while the account is still allowed, else null. */
      owner: () => string | null;
      model: () => LanguageModel;
      notify: (notice: Notice) => Promise<void>;
      /** Runs `triage(id)` soon, outside the email handler's request. */
      triageLater: (id: number) => Promise<unknown>;
      startChat: (message: UIMessage) => Promise<string>;
    }
  ) {}

  get inbox() {
    return new Inbox(this.host.agent);
  }

  /** `alias@domain` once allocated, else null. */
  address() {
    const { env, store } = this.host;
    return emailAddress(store.getEmailConfig(), env.EMAIL_DOMAIN);
  }

  get channel() {
    const { env, store, agent, owner } = this.host;
    return new EmailChannel({
      env,
      userId: () => agent.name.slice("google:".length),
      store,
      owner,
      inbox: () => this.inbox,
      ownerName: () => store.getOwnerName(),
      // Gmail's forwarding confirmation is passed on as is: the owner needs
      // its link now. Everything else is read by the model first.
      onEmail: async (id, email, trusted, preview) => {
        if (preview === null) {
          await this.host.triageLater(id);
          return;
        }
        const unread = this.inbox.unreadCount();
        const notice = { ...email, id, unread, trusted, preview };
        await this.host.notify(emailNotice({ ...notice, triage: null }));
      }
    });
  }

  get mailbox() {
    const { agent, startChat } = this.host;
    return new Mailbox({
      inbox: () => this.inbox,
      broadcast: (event) => agent.broadcast(JSON.stringify(event)),
      startChat
    });
  }

  /** Reads a new email and tells the owner what it is, without being asked. */
  async triage(id: number) {
    const notice = await triagedNotice(this.inbox, this.host.model, id);
    if (notice) await this.host.notify(notice);
  }
}
