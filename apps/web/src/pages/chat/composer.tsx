import { useEffect, useRef } from "react";

import { ArrowUp, Mic, Paperclip, Square } from "../../components/icons";
import type { Attachment } from "../../lib/attachments";
import { useVoiceInput } from "./use-voice-input";

const MAX_HEIGHT = 200;

/**
 * The message box. Enter sends, Shift+Enter adds a line, and IME
 * composition (e.g. Chinese input) never sends early.
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

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  };

  // The transcript lands after an async upload; append to the live text.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const voice = useVoiceInput((text) => {
    const current = valueRef.current;
    onChange(current ? `${current} ${text}` : text);
    requestAnimationFrame(() => {
      autosize();
      textareaRef.current?.focus();
    });
  }, onError);

  const send = () => {
    onSend();
    requestAnimationFrame(() => {
      autosize();
      textareaRef.current?.focus();
    });
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
          <Paperclip />
        </button>
        {voice.supported && (
          <button
            type="button"
            className={`attach-btn${voice.state === "recording" ? " recording" : ""}`}
            onClick={voice.toggle}
            disabled={voice.state === "transcribing"}
            aria-label={
              voice.state === "recording" ? "Stop recording" : "Voice input"
            }
            title={
              voice.state === "recording" ? "Stop recording" : "Voice input"
            }
          >
            {voice.state === "transcribing" ? "…" : <Mic />}
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          placeholder="Message Cot…"
          onChange={(e) => {
            onChange(e.target.value);
            autosize();
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
        {busy && !value.trim() && attachments.length === 0 ? (
          <button
            type="button"
            className="send-btn"
            onClick={onStop}
            aria-label="Stop"
          >
            <Square />
          </button>
        ) : (
          <button
            type="submit"
            className="send-btn"
            disabled={!value.trim() && attachments.length === 0}
            aria-label="Send"
          >
            <ArrowUp />
          </button>
        )}
      </form>
    </footer>
  );
}
