import { normalizeSenders, type EmailStatus } from "@cot/shared";

import { addresses } from "./addresses";
import { newAlias, toEmailStatus, type EmailConfig } from "./config";
import { gateEmail } from "./gate";
import type { Inbox } from "./inbox";
import { parseEmail, type ParsedEmail } from "./parse";

/** Where the channel keeps its config: the owning assistant's storage. */
export type EmailConfigStore = {
  getEmailConfig(): EmailConfig | null;
  saveEmailConfig(config: EmailConfig): void;
};

export type EmailReceiveResult = "accepted" | "rejected";

/**
 * The assistant's own mailbox. The assistant exposes these methods as
 * callables and Worker RPC; this class holds the logic.
 */
export class EmailChannel {
  constructor(
    private readonly options: {
      env: Env;
      /** The Google account id (`sub`) that owns the assistant. */
      userId: () => string;
      store: EmailConfigStore;
      inbox: () => Inbox;
      /** The owner's email while the account is still allowed, else null. */
      owner: () => string | null;
      /** Tells the owner about a new email (web and Telegram). */
      onEmail: (email: ParsedEmail, preview: string | null) => Promise<void>;
    }
  ) {}

  private get domain() {
    return this.options.env.EMAIL_DOMAIN;
  }

  /** The address, allocated on first use. */
  async status(): Promise<EmailStatus> {
    if (!this.domain) return { enabled: false };
    const config = this.options.store.getEmailConfig();
    if (config) return toEmailStatus(config, this.domain);
    return this.assign({ alias: newAlias(), allowedSenders: [] });
  }

  /** Replaces the address; mail to the old one bounces from then on. */
  async newAddress(): Promise<EmailStatus> {
    if (!this.domain) return { enabled: false };
    const allowedSenders =
      this.options.store.getEmailConfig()?.allowedSenders ?? [];
    return this.assign({ alias: newAlias(), allowedSenders });
  }

  async updateAllowedSenders(senders: unknown): Promise<EmailStatus> {
    const allowedSenders = normalizeSenders(senders);
    const status = await this.status();
    const config = this.options.store.getEmailConfig();
    if (!config) return status;
    const next = { ...config, allowedSenders };
    this.options.store.saveEmailConfig(next);
    return toEmailStatus(next, this.domain);
  }

  private async assign(config: EmailConfig) {
    await addresses(this.options.env).set(config.alias, this.options.userId());
    this.options.store.saveEmailConfig(config);
    return toEmailStatus(config, this.domain);
  }

  /** Files an email the Worker routed here, if its sender may send. */
  async receive(
    envelopeFrom: string,
    raw: Uint8Array
  ): Promise<EmailReceiveResult> {
    const config = this.options.store.getEmailConfig();
    if (!config) return "rejected";
    const email = await parseEmail(raw);
    const decision = gateEmail({
      envelopeFrom,
      headerFrom: email.fromAddress,
      owner: this.options.owner(),
      allowedSenders: config.allowedSenders
    });
    switch (decision.kind) {
      case "reject":
        return "rejected";
      case "accept":
        this.options.inbox().add(email);
        await this.options.onEmail(email, null);
        return "accepted";
      case "forwarding-confirmation":
        // The owner needs the code or link in it to finish setting up
        // Gmail forwarding, so pass the text on directly.
        this.options.inbox().add(email);
        await this.options.onEmail(email, email.body.slice(0, 600));
        return "accepted";
    }
  }
}
