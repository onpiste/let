import { useEffect, useRef, useState } from "react";

import { MAX_AUDIO_BYTES } from "@cot/shared";

import { errorText } from "../../lib/errors";
import { transcribe } from "../../lib/transcribe";

export type VoiceState = "idle" | "recording" | "transcribing";

/**
 * Record from the microphone and hand the transcript to `onText`. `confirm`
 * stops and transcribes; `cancel` stops and throws the recording away.
 * `analyser` is live while recording so the UI can draw the level.
 */
export function useVoiceInput(
  onText: (text: string) => void,
  onError: (message: string) => void
) {
  const [state, setState] = useState<VoiceState>("idle");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const discard = useRef(false);
  const supported =
    typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices;

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const context = new AudioContext();
      const node = context.createAnalyser();
      node.fftSize = 256;
      context.createMediaStreamSource(stream).connect(node);
      const chunks: Blob[] = [];
      let bytes = 0;
      discard.current = false;
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
        void context.close();
        setAnalyser(null);
        if (discard.current) {
          setState("idle");
          return;
        }
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
      setAnalyser(node);
      setState("recording");
    } catch (e) {
      onError(errorText(e));
    }
  };

  const finish = (keep: boolean) => {
    if (recorder.current?.state !== "recording") return;
    discard.current = !keep;
    recorder.current.stop();
  };

  // Release the microphone if the composer unmounts mid-recording.
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") {
        discard.current = true;
        recorder.current.stop();
      }
    },
    []
  );

  return {
    state,
    analyser,
    supported,
    start: () => void start(),
    confirm: () => finish(true),
    cancel: () => finish(false)
  };
}
