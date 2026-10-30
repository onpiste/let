import { useEffect, useRef, useState } from "react";

import { Check, X } from "../../components/icons";
import type { VoiceState } from "./use-voice-input";

const BARS = 36;
// New level every few frames, so the waveform scrolls at a readable pace.
const FRAMES_PER_BAR = 3;

function format(seconds: number) {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Root-mean-square loudness of the live signal, 0..1. */
function level(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>) {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (const v of buffer) sum += ((v - 128) / 128) ** 2;
  return Math.sqrt(sum / buffer.length);
}

/**
 * Replaces the message box while dictating: cancel, a scrolling waveform with
 * the elapsed time, and confirm. While the upload is transcribing the
 * waveform gives way to an animated status and the buttons are disabled.
 */
export function VoiceBar({
  state,
  analyser,
  onCancel,
  onConfirm
}: {
  state: Exclude<VoiceState, "idle">;
  analyser: AnalyserNode | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const wave = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(0);
  const recording = state === "recording";

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      250
    );
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    const el = wave.current;
    if (!el || !analyser) return;
    const bars = Array.from(el.children) as HTMLElement[];
    const levels = Array.from({ length: BARS }, () => 0);
    const buffer = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let raf = 0;
    const tick = () => {
      if (frame++ % FRAMES_PER_BAR === 0) {
        levels.shift();
        // Speech sits low in RMS; boost it so quiet voices still move.
        levels.push(Math.min(1, level(analyser, buffer) * 4));
        bars.forEach((bar, i) => {
          bar.style.transform = `scaleY(${Math.max(0.08, levels[i] ?? 0)})`;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return (
    <output className="composer voice-bar" aria-live="polite">
      <button
        type="button"
        className="attach-btn"
        onClick={onCancel}
        disabled={!recording}
        aria-label="Cancel recording"
        title="Cancel recording"
      >
        <X />
      </button>
      {recording ? (
        <>
          <div className="voice-wave" ref={wave} aria-hidden>
            {Array.from({ length: BARS }, (_, i) => (
              <span key={i} />
            ))}
          </div>
          <span className="voice-time">{format(seconds)}</span>
        </>
      ) : (
        <div className="voice-status">
          <span className="spinner" aria-hidden />
          Transcribing…
        </div>
      )}
      <button
        type="button"
        className="send-btn"
        onClick={onConfirm}
        disabled={!recording}
        aria-label="Finish and transcribe"
        title="Finish and transcribe"
      >
        <Check />
      </button>
    </output>
  );
}
