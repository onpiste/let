import { Agent, getAgentByName, type Connection } from "agents";
import {
  withVoice,
  WorkersAIFluxSTT,
  type VoiceTurnContext
} from "agents/voice";

import { log } from "../../log/logger";
import { phoneConfig } from "./config";
import { WorkersAIPcmTTS } from "./pcm-tts";

// pcm16 at 16 kHz is what the Twilio adapter turns into the caller's audio.
const VoiceAgent = withVoice(Agent, { audioFormat: "pcm16" });

/** A message takes a few exchanges; past this the call is wrapped up. */
const MAX_CALLER_TURNS = 12;
const WRAP_UP = "Thanks, I have your message. Goodbye.";

/**
 * One call the assistant answers for its owner: the SDK's voice pipeline
 * (speech to text, turn detection, barge-in, text to speech) in a Durable
 * Object named after the Twilio call. The caller is someone else, so the
 * replies come from the owner's assistant as a receptionist with no tools,
 * memory or chats (PhoneLine), and the message is handed over when the call
 * ends.
 *
 * Reachable only through the Twilio adapter (twilio.ts); the router has no
 * generic /agents/* route.
 */
export class VoiceCall extends VoiceAgent<Env> {
  override transcriber = new WorkersAIFluxSTT(this.env.AI);
  override tts = new WorkersAIPcmTTS(this.env.AI);

  private get logger() {
    // A call's lines share its Twilio CallSid, as one request's would.
    return log.with({ requestId: this.name });
  }

  /** The owner's assistant's side of the call, or null when calls are off. */
  private async line() {
    const config = phoneConfig(this.env);
    if (!config) return null;
    const assistant = await getAgentByName(
      this.env.Assistant,
      `google:${config.account}`
    );
    return assistant.phoneLine();
  }

  /** Set by the answer webhook before the audio starts. */
  async setCaller(from: string) {
    await this.ctx.storage.put("caller", from);
  }

  override async onCallStart(connection: Connection) {
    this.logger.info("phone", "Call started");
    const line = await this.line();
    await this.speak(connection, line ? await line.greeting() : WRAP_UP);
  }

  override async onTurn(transcript: string, context: VoiceTurnContext) {
    const callerTurns = context.messages.filter((m) => m.role === "user");
    if (callerTurns.length >= MAX_CALLER_TURNS) return WRAP_UP;
    try {
      const line = await this.line();
      if (!line) return WRAP_UP;
      const reply = await line.reply([
        ...context.messages,
        { role: "user", content: transcript }
      ]);
      // Barge-in aborts the turn; cancelling the stream stops the model.
      context.signal.addEventListener("abort", () => void reply.cancel(), {
        once: true
      });
      return reply.pipeThrough(new TextDecoderStream());
    } catch (error) {
      this.logger.error("phone", "Turn failed", error);
      return "Sorry, I didn't catch that. Could you say it again?";
    }
  }

  override async onCallEnd() {
    this.logger.info("phone", "Call ended");
    try {
      const line = await this.line();
      const from = (await this.ctx.storage.get<string>("caller")) ?? "";
      await line?.ended(from, this.getConversationHistory(100));
    } catch (error) {
      this.logger.error("phone", "Handing over the message failed", error);
    }
  }
}
