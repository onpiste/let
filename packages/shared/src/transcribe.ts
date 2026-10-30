/** Voice input: clients POST recorded audio here and get text back. */
export const TRANSCRIBE_ROUTE = "/chat/transcribe";

/** The Worker rejects larger recordings; clients should stop before this. */
export const MAX_AUDIO_BYTES = 10_000_000;

export type TranscribeResponse = { text: string };
