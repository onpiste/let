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

/**
 * One phone call: the SDK's voice pipeline (speech to text, turn detection,
 * barge-in, text to speech) in a Durable Object named after the Twilio call.
 * It holds no assistant state of its own: each turn is handed to the owner's
 * `Assistant`, which runs it in the chat in use with the usual model, memory
 * and tools, so the call shows up in that chat in the web and iOS apps.
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

  override onCallStart(connection: Connection) {
    this.logger.info("phone", "Call started");
    // Not awaited: the greeting plays while the caller starts talking.
    void this.speak(connection, "Hi, it's your assistant. How can I help?");
  }

  override onCallEnd() {
    this.logger.info("phone", "Call ended");
  }

  override async onTurn(transcript: string, context: VoiceTurnContext) {
    const config = phoneConfig(this.env);
    if (!config) return "Phone calls are turned off. Goodbye.";
    const assistant = await getAgentByName(
      this.env.Assistant,
      `google:${config.account}`
    );
    try {
      const reply = await assistant.voiceTurn(transcript);
      // Barge-in aborts the turn; cancelling the stream stops the chat's turn.
      context.signal.addEventListener("abort", () => void reply.cancel(), {
        once: true
      });
      return reply.pipeThrough(new TextDecoderStream());
    } catch (error) {
      this.logger.error("phone", "Turn failed", error);
      return "Sorry, something went wrong. Please try again.";
    }
  }
}
