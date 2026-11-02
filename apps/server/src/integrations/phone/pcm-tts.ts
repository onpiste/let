import type { TTSProvider } from "agents/voice";

const MODEL = "@cf/deepgram/aura-2-en";

/**
 * Workers AI text to speech as raw 16 kHz 16-bit PCM. The SDK's WorkersAITTS
 * returns MP3, which the Workers runtime can't decode and the Twilio adapter
 * can't send, so a call asks Aura 2 for linear16 with no container instead.
 * Aura 2 speaks English (and Spanish with the -es model) only.
 */
export class WorkersAIPcmTTS implements TTSProvider {
  constructor(
    private readonly ai: Ai,
    private readonly speaker: "asteria" | "luna" | "orion" = "asteria"
  ) {}

  async synthesize(text: string, signal?: AbortSignal) {
    const response = await this.ai.run(
      MODEL,
      {
        text,
        speaker: this.speaker,
        encoding: "linear16",
        container: "none",
        sample_rate: 16_000
      },
      { returnRawResponse: true, ...(signal ? { signal } : {}) }
    );
    if (!response.ok) return null;
    const audio = await response.arrayBuffer();
    // The adapter reads frames as Int16Array, which needs an even length.
    return audio.byteLength % 2 === 0 ? audio : audio.slice(0, -1);
  }
}
