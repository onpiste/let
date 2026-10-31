/**
 * A bare-bones client for the Gemini REST API. Plain fetch rather than an
 * SDK: the two calls Cot makes (grounded search, Deep Research) don't justify
 * another dependency, and the Worker stays small.
 */
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";

export async function gemini<T>(
  apiKey: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${GEMINI_API}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "content-type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Gemini API ${response.status}: ${detail}`);
  }
  // Trust boundary: the shape is Google's documented response for `path`.
  return (await response.json()) as T;
}
