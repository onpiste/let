import { TRANSCRIBE_ROUTE, type TranscribeResponse } from "@cot/shared";

/** Sends a recording to the Worker and returns the spoken text. */
export async function transcribe(audio: Blob) {
  const res = await fetch(TRANSCRIBE_ROUTE, {
    method: "POST",
    headers: { "Content-Type": audio.type || "application/octet-stream" },
    body: audio
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
  // Trust boundary: the Worker's JSON response.
  return ((await res.json()) as TranscribeResponse).text;
}
