import { useRef } from "react";

import { ArrowUp, Square } from "../../components/icons";

const MAX_HEIGHT = 200;

/**
 * The message box. Enter sends, Shift+Enter adds a line, and IME
 * composition (e.g. Chinese input) never sends early.
 */
export function Composer({
  value,
  busy,
  onChange,
  onSend,
  onStop
}: {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autosize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  };

  const send = () => {
    onSend();
    requestAnimationFrame(() => {
      autosize();
      textareaRef.current?.focus();
    });
  };

  return (
    <footer className="composer-wrap">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
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
        {busy ? (
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
            disabled={!value.trim()}
            aria-label="Send"
          >
            <ArrowUp />
          </button>
        )}
      </form>
    </footer>
  );
}
