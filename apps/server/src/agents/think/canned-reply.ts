import type { LanguageModel } from "ai";

type ModelV4 = Extract<LanguageModel, { specificationVersion: "v4" }>;
type StreamPart =
  Awaited<ReturnType<ModelV4["doStream"]>>["stream"] extends ReadableStream<
    infer Part
  >
    ? Part
    : never;

const NO_USAGE = {
  inputTokens: {
    total: 0,
    noCache: 0,
    cacheRead: undefined,
    cacheWrite: undefined
  },
  outputTokens: { total: 0, text: 0, reasoning: undefined }
};
const STOP = { unified: "stop", raw: undefined } as const;

/**
 * A stand-in model that answers with fixed text and calls no provider.
 * Returning it from `beforeTurn` lets the assistant refuse a turn (e.g. over
 * a usage limit) as an ordinary reply, on the web and in messengers alike.
 */
export function cannedReply(text: string): ModelV4 {
  return {
    specificationVersion: "v4",
    provider: "cot",
    modelId: "canned-reply",
    supportedUrls: {},
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: "text", text }],
        finishReason: STOP,
        usage: NO_USAGE,
        warnings: []
      }),
    doStream: () => {
      const parts: StreamPart[] = [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: text },
        { type: "text-end", id: "t" },
        { type: "finish", finishReason: STOP, usage: NO_USAGE }
      ];
      return Promise.resolve({
        stream: new ReadableStream<StreamPart>({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          }
        })
      });
    }
  };
}
