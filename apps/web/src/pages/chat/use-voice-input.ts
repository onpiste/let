import { useEffect, useRef, useState } from "react";

import { MAX_AUDIO_BYTES } from "@cot/shared";

import { errorText } from "../../lib/errors";
import { transcribe } from "../../lib/transcribe";

export type VoiceState = "idle" | "recording" | "transcribing";

/**
 * Record from the microphone and hand the transcript to `onText`. `toggle`
 * starts a recording, or stops it and transcribes.
 */
export function useVoiceInput(
  onText: (text: string) => void,
  onError: (message: string) => void
) {
  const [state, setState] = useState<VoiceState>("idle");
  const recorder = useRef<MediaRecorder | null>(null);
  const supported =
    typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices;

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      let bytes = 0;
      rec.ondataavailable = (e) => {
        chunks.push(e.data);
        bytes += e.data.size;
        // Stop before the Worker would reject the upload.
        if (bytes > MAX_AUDIO_BYTES * 0.9 && rec.state === "recording") {
          rec.stop();
        }
      };
      rec.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        setState("transcribing");
        const audio = new Blob(chunks, { type: rec.mimeType });
        transcribe(audio)
          .then((text) => text && onText(text))
          .catch((e: unknown) => onError(errorText(e)))
          .finally(() => setState("idle"));
      };
      // A timeslice makes the size guard above fire while recording.
      rec.start(1000);
      recorder.current = rec;
      setState("recording");
    } catch (e) {
      onError(errorText(e));
    }
  };

  const toggle = () => {
    if (state === "recording") recorder.current?.stop();
    else if (state === "idle") void start();
  };

  // Release the microphone if the composer unmounts mid-recording.
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    []
  );

  return { state, supported, toggle };
}
