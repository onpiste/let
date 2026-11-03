import type { UIMessage } from "ai";
import { RpcTarget } from "cloudflare:workers";

import { countTurn } from "../../agents/common/usage";
import { languageModelFor, paidByUser } from "../../agents/think/model";
import type { AssistantStore } from "../../agents/think/store";
import { log } from "../../log/logger";
import type { OwnerPush } from "../push";
import type { TelegramChannel } from "../telegram/channel";
import {
  callProfile,
  greeting,
  receptionistReply,
  summarizeCall,
  transcriptText,
  type CallReport,
  type CallTurn
} from "./receptionist";

/** What answering the owner's phone needs from their assistant. */
type PhoneLineHost = {
  env: Env;
  store: AssistantStore;
  /** False once the owner is no longer in ALLOWED_EMAILS. */
  allowed: boolean;
  /** Adds a message to the chat in use, without a turn. */
  post: (message: UIMessage) => Promise<void>;
  /** Tell the owner outside the apps. */
  telegram: Pick<TelegramChannel, "notify">;
  push: Pick<OwnerPush, "notify">;
};

const OFF_MESSAGE = "Sorry, I can't take a message right now. Goodbye.";

function textStream(text: string) {
  return new Response(text).body ?? new ReadableStream<Uint8Array>();
}

/**
 * The assistant's side of a call it answers for the owner (voice-call.ts),
 * handed to the call over DO RPC like ChatServices. The model and keys stay
 * in the assistant; the call only gets reply text back.
 */
export class PhoneLine extends RpcTarget {
  constructor(private readonly host: PhoneLineHost) {
    super();
    host.store.ensureTables();
  }

  private get settings() {
    return this.host.store.getSettings();
  }

  private get profile() {
    return callProfile(
      this.host.store.getOwnerName(),
      this.settings.assistantName
    );
  }

  private get model() {
    return languageModelFor(this.settings, this.host.env);
  }

  greeting() {
    return this.host.allowed ? greeting(this.profile) : OFF_MESSAGE;
  }

  /** The next reply. Each counts against the owner's message limits. */
  reply(messages: CallTurn[]) {
    if (!this.host.allowed) return textStream(OFF_MESSAGE);
    const { store, env } = this.host;
    if (countTurn(store, env, paidByUser(this.settings))) {
      return textStream(OFF_MESSAGE);
    }
    return receptionistReply(this.model, this.profile, messages);
  }

  /** Writes the call up in the chat in use and tells the owner. */
  async ended(from: string, transcript: CallTurn[]) {
    if (!this.host.allowed) return;
    // A caller who hung up during the greeting left nothing to pass on.
    if (!transcript.some((turn) => turn.role === "user")) return;
    let report: CallReport | null = null;
    try {
      report = await summarizeCall(this.model, from, transcript);
    } catch (error) {
      log.error("phone", "Call summary failed", error);
    }
    const caller = from || "an unknown number";
    const title = report?.urgent
      ? `📞 Urgent call from ${caller}`
      : `📞 Call from ${caller}`;
    const summary = report?.summary ?? "I couldn't summarize this call.";
    await this.host.post({
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `**${title}**\n\n${summary}\n\n---\n\n${transcriptText(transcript)}`
        }
      ],
      metadata: { createdAt: Date.now() }
    });
    await Promise.all([
      this.host.telegram.notify(`${title}: ${summary}`),
      this.host.push.notify({ title, body: summary })
    ]);
  }
}
