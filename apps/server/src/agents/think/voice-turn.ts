import type { StreamCallback } from "@cloudflare/think";

/** The Think channel a phone or voice turn runs on (Chat.configureChannels). */
export const VOICE_CHANNEL = "voice";

/** Appended to the system prompt on voice turns: the reply is spoken. */
export const VOICE_INSTRUCTIONS = `
## Voice

This turn is a live voice call: your reply is read aloud by text-to-speech.
Answer in one to three short spoken sentences. No markdown, lists, tables,
links, code or emoji. Say numbers, dates and times the way a person would.
If a task will take a while, say so in a few words before you start it.`;

type RunTurn = (callback: StreamCallback, signal: AbortSignal) => Promise<void>;

/** The reply text in one UIMessageChunk (JSON), if it carries any. */
function textDelta(json: string) {
  // Think emits AI SDK UIMessageChunk JSON; only text deltas are spoken.
  const chunk = JSON.parse(json) as { type?: unknown; delta?: unknown };
  return chunk.type === "text-delta" && typeof chunk.delta === "string"
    ? chunk.delta
    : "";
}

/**
 * Runs a turn and streams just its reply text, as UTF-8 bytes because DO RPC
 * streams carry bytes. Cancelling the stream (the caller interrupted) stops
 * the turn; what was said so far stays in the chat.
 */
export function replyTextStream(run: RunTurn) {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let finished = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = (error?: unknown) => {
        if (finished) return;
        finished = true;
        if (error === undefined) controller.close();
        else controller.error(error);
      };
      const callback: StreamCallback = {
        onStart: () => undefined,
        onEvent: (json) => {
          const delta = textDelta(json);
          if (delta && !finished) controller.enqueue(encoder.encode(delta));
        },
        onDone: () => finish(),
        onError: (error) => finish(new Error(error)),
        // A recovered reply lands in the chat, not on this call.
        onInterrupted: () => finish()
      };
      void run(callback, abort.signal).then(
        () => finish(),
        (error: unknown) => finish(error)
      );
    },
    cancel() {
      finished = true;
      abort.abort();
    }
  });
}
