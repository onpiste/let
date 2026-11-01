import { geminiFetch, type GeminiKey } from "./gemini";

/** The parts of a Deep Research stream event that Cot reads. */
type StreamEvent = {
  event_type?: string;
  delta?: { type?: string; content?: { text?: string } };
};

/**
 * Follows a running Deep Research run's event stream for up to `windowMs`,
 * calling `onThought` with the gist of each thought summary. Only the stream
 * carries these; a plain poll shows nothing until the run ends.
 *
 * The stream has no event ids to resume from, so each call replays the run's
 * thoughts from the start, and the last one seen is the newest.
 *
 * Resolves `true` when the run ended (or the stream closed by itself), and
 * `false` when the window ran out with the run still going.
 */
export async function followResearch(
  env: Env,
  key: GeminiKey,
  id: string,
  windowMs: number,
  onThought: (gist: string) => void
) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), windowMs);
  try {
    const response = await geminiFetch(
      env,
      key,
      `interactions/${encodeURIComponent(id)}?stream=true`,
      { signal: abort.signal }
    );
    if (!response.body) return true;
    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();
    let buffer = "";
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- a stream reads in order
      const { done, value } = await reader.read();
      if (done) return true;
      buffer += value;
      // Server-sent events are separated by a blank line.
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const parsed = parseEvent(event);
        if (!parsed) continue;
        const type = parsed.event_type ?? "";
        if (type === "interaction.completed" || type === "interaction.error") {
          return true;
        }
        if (parsed.delta?.type === "thought_summary") {
          const gist = gistOf(parsed.delta.content?.text ?? "");
          if (gist) onThought(gist);
        }
      }
    }
  } catch (error) {
    if (abort.signal.aborted) return false;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseEvent(event: string): StreamEvent | null {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length))
    .join("\n")
    .trim();
  if (!data.startsWith("{")) return null;
  try {
    // Trust boundary: Google's documented stream event shape.
    return JSON.parse(data) as StreamEvent;
  } catch {
    return null;
  }
}

/** A summary opens with a bold title, e.g. "**Reconciling projections**". */
function gistOf(text: string) {
  const gist = text.trim().split("\n")[0]?.replace(/\*+/g, "").trim();
  return gist ? gist.slice(0, 160) : null;
}
