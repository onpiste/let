import {
  normalizeAlias,
  normalizeEmailPolicy,
  type EmailStatus
} from "@cot/shared";

import { addresses } from "./addresses";
import {
  aliasCandidates,
  DEFAULT_POLICY,
  newAlias,
  toEmailStatus,
  type EmailConfig
} from "./config";
import { gateEmail } from "./gate";
import type { Inbox } from "./inbox";
import { parseEmail, type ParsedEmail } from "./parse";

/** Where the channel keeps its config: the owning assistant's storage. */
export type EmailConfigStore = {
  getEmailConfig(): EmailConfig | null;
  saveEmailConfig(config: EmailConfig): void;
};

/**
 * How much mail from strangers the mailbox takes before bouncing it. Mail
 * from the owner and trusted senders is never limited.
 */
const STRANGER_LIMITS = [
  { window: "-1 hour", max: 30 },
  { window: "-1 day", max: 200 }
] as const;

export type EmailReceiveResult = "accepted" | "rejected" | "rate-limited";

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
      /** The owner's Google name, the default for the address. */
      ownerName: () => string | null;
      /** Tells the owner about a new email (web and Telegram). */
      onEmail: (
        email: ParsedEmail,
        trusted: boolean,
        preview: string | null
      ) => Promise<void>;
    }
  ) {}

  private get domain() {
    return this.options.env.EMAIL_DOMAIN;
  }

  /** The address, allocated from the owner's name on first use. */
  async status(): Promise<EmailStatus> {
    if (!this.domain) return { enabled: false };
    const config = this.options.store.getEmailConfig();
    if (config) return toEmailStatus(config, this.domain);
    const { env, userId, owner, ownerName } = this.options;
    const candidates = aliasCandidates(ownerName(), owner());
    const alias =
      (await addresses(env).claimFirst(candidates, userId())) ??
      (await this.claimRandom());
    return this.save({ alias, ...DEFAULT_POLICY });
  }

  /**
   * Renames the address. Mail to the old one bounces from then on, and the
   * old name is free for anyone to take.
   */
  async setAlias(input: unknown): Promise<EmailStatus> {
    const alias = normalizeAlias(input);
    const status = await this.status();
    const config = this.options.store.getEmailConfig();
    if (!config || config.alias === alias) return status;
    const { env, userId } = this.options;
    if (!(await addresses(env).claim(alias, userId()))) {
      throw new Error(`${alias}@${this.domain} is already taken.`);
    }
    return this.save({ ...config, alias });
  }

  async updatePolicy(input: unknown): Promise<EmailStatus> {
    const policy = normalizeEmailPolicy(input);
    const status = await this.status();
    const config = this.options.store.getEmailConfig();
    if (!config) return status;
    const next = { ...config, ...policy };
    this.options.store.saveEmailConfig(next);
    return toEmailStatus(next, this.domain);
  }

  private async claimRandom() {
    const { env, userId } = this.options;
    const candidates = Array.from({ length: 5 }, newAlias);
    const alias = await addresses(env).claimFirst(candidates, userId());
    if (!alias) throw new Error("Could not find a free email address.");
    return alias;
  }

  private save(config: EmailConfig) {
    this.options.store.saveEmailConfig(config);
    return toEmailStatus(config, this.domain);
  }

  private strangerLimitReached() {
    const inbox = this.options.inbox();
    return STRANGER_LIMITS.some(
      ({ window, max }) => inbox.countStrangersSince(window) >= max
    );
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
      policy: config
    });
    switch (decision.kind) {
      case "reject":
        return "rejected";
      case "accept":
        if (!decision.trusted && this.strangerLimitReached()) {
          return "rate-limited";
        }
        this.options.inbox().add(email, decision.trusted);
        await this.options.onEmail(email, decision.trusted, null);
        return "accepted";
      case "forwarding-confirmation":
        // The owner needs the code or link in it to finish setting up
        // Gmail forwarding, so pass the text on directly.
        this.options.inbox().add(email, false);
        await this.options.onEmail(email, false, email.body.slice(0, 600));
        return "accepted";
    }
  }
}
