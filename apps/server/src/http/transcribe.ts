import { MAX_AUDIO_BYTES, type TranscribeResponse } from "@cot/shared";

import { jsonResponse } from "./responses";

const MODEL = "@cf/openai/whisper-large-v3-turbo";

/** Workers AI takes audio as base64; chunk to stay within call-arg limits. */
function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Speech to text for the composer. The body is the raw recording (webm, mp4,
 * m4a…); the language is auto-detected. Uses the Workers AI binding, so it
 * needs no extra key.
 */
export async function handleTranscribe(request: Request, env: Env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.length === 0) {
    return jsonResponse({ error: "Empty recording" }, { status: 400 });
  }
  if (audio.length > MAX_AUDIO_BYTES) {
    return jsonResponse({ error: "Recording too long" }, { status: 413 });
  }
  const result = await env.AI.run(MODEL, { audio: toBase64(audio) });
  const body: TranscribeResponse = { text: (result.text ?? "").trim() };
  return jsonResponse(body);
}
