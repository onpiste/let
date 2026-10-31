import { gemini } from "./gemini";

type GenerateResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
    };
  }[];
};

const MAX_SOURCES = 8;

/**
 * Answers `query` from a live Google Search, via Gemini's search grounding,
 * and lists the pages the answer came from. Works whichever model the user
 * chats with, as long as they have a Google key.
 */
export async function searchWeb(env: Env, apiKey: string, query: string) {
  const result = await gemini<GenerateResponse>(
    apiKey,
    `models/${env.GEMINI_SEARCH_MODEL}:generateContent`,
    {
      contents: [{ role: "user", parts: [{ text: query }] }],
      tools: [{ google_search: {} }]
    }
  );
  const candidate = result.candidates?.[0];
  const answer = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .flatMap((c) => (c.web?.uri ? [c.web] : []))
    .slice(0, MAX_SOURCES)
    .map((w, i) => `[${i + 1}] ${w.title ?? w.uri} — ${w.uri}`);
  if (!answer) return "The search returned nothing.";
  return sources.length
    ? `${answer}\n\nSources:\n${sources.join("\n")}`
    : answer;
}
