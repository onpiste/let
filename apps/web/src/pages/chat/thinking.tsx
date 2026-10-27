export function Thinking({
  text,
  streaming
}: {
  text: string;
  streaming: boolean;
}) {
  if (!text.trim()) return null;
  return (
    <details className="thinking" open={streaming}>
      <summary>{streaming ? "Thinking…" : "Thought process"}</summary>
      <div className="whitespace-pre-wrap">{text}</div>
    </details>
  );
}

export function TypingDots() {
  return (
    <div className="typing" aria-label="Assistant is typing">
      <span />
      <span />
      <span />
    </div>
  );
}
