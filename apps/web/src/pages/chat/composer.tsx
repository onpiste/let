import { useEffect, useLayoutEffect, useRef } from "react";

import { ArrowUp, Mic, Plus, Square } from "../../components/icons";
import type { Attachment } from "../../lib/attachments";
import { useVoiceInput } from "./use-voice-input";
import { VoiceBar } from "./voice-bar";

const MAX_HEIGHT = 200;

/**
 * The message box. Enter sends, Shift+Enter adds a line, and IME
 * composition (e.g. Chinese input) never sends early. Laid out like the iOS
 * `ComposerView`: a round attach button outside the pill, and inside it the
 * text plus one trailing button (mic while empty, send, queue or stop).
 */
export function Composer({
  value,
  busy,
  attachments,
  onChange,
  onAttach,
  onError,
  onRemoveAttachment,
  onSend,
  onStop
}: {
  value: string;
  busy: boolean;
  attachments: Attachment[];
  onChange: (value: string) => void;
  onAttach: (files: File[]) => void;
  onError: (message: string) => void;
  onRemoveAttachment: (index: number) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The transcript lands after an async upload; append to the live text.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const voice = useVoiceInput((text) => {
    const current = valueRef.current;
    onChange(current ? `${current} ${text}` : text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, onError);
  // Size the box from its text whenever the text changes, however it changed:
  // typing, a prefill from a task or reminder, a transcript, or a send that
  // clears it. It remounts after the voice bar, so re-measure then too.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const autosize = () => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
      // Only scroll once the text outgrows the cap; otherwise browsers show
      // an empty scrollbar on a short box.
      el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
    };
    autosize();
    // A narrower window wraps the same text onto more lines.
    window.addEventListener("resize", autosize);
    return () => window.removeEventListener("resize", autosize);
  }, [value, voice.state]);

  const canSend = value.trim() !== "" || attachments.length > 0;

  const send = () => {
    if (!canSend) return;
    onSend();
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <footer className="composer-wrap">
      {attachments.length > 0 && (
        <div className="attachments">
          {attachments.map((a, i) => (
            <span className="chip-file" key={`${a.name}-${i}`}>
              {a.name}
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => onRemoveAttachment(i)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {voice.state !== "idle" ? (
        <VoiceBar
          state={voice.state}
          analyser={voice.analyser}
          onCancel={voice.cancel}
          onConfirm={voice.confirm}
        />
      ) : (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept="text/*,image/*,application/pdf,.md,.csv,.json,.yaml,.yml,.log,.py,.js,.ts,.tsx,.go,.rs,.java,.sql"
            onChange={(e) => {
              onAttach(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="attach-btn"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach files"
            title="Attach files"
          >
            <Plus />
          </button>
          <div className="composer-box">
            <textarea
              ref={textareaRef}
              value={value}
              rows={1}
              placeholder="Message Cot…"
              onChange={(e) => {
                onChange(e.target.value);
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {canSend ? (
              <button type="submit" className="send-btn" aria-label="Send">
                <ArrowUp />
              </button>
            ) : busy ? (
              <button
                type="button"
                className="send-btn"
                onClick={onStop}
                aria-label="Stop"
              >
                <Square />
              </button>
            ) : (
              voice.supported && (
                <button
                  type="button"
                  className="mic-btn"
                  onClick={voice.start}
                  aria-label="Voice input"
                  title="Voice input"
                >
                  <Mic />
                </button>
              )
            )}
          </div>
        </form>
      )}
    </footer>
  );
}
