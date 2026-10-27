import { code } from "@streamdown/code";
import { isToolUIPart, type UIMessage } from "ai";
import { Streamdown } from "streamdown";

import { Thinking, TypingDots } from "./thinking";
import { ToolChip } from "./tool-chip";

/** The conversation: user bubbles, and assistant text, reasoning and tools. */
export function MessageList({
  messages,
  busy,
  waiting,
  toolLabels,
  onApproval
}: {
  messages: UIMessage[];
  /** A turn is streaming; the last message may still change. */
  busy: boolean;
  /** Waiting for the assistant's first token. */
  waiting: boolean;
  toolLabels: Record<string, string>;
  onApproval: (id: string, approved: boolean) => void;
}) {
  return (
    <div className="messages">
      {messages.map((m, i) => {
        const isLast = i === messages.length - 1;
        if (m.role === "user") {
          const text = m.parts
            .filter((p) => p.type === "text")
            .map((p) => (p as { text: string }).text)
            .join("");
          return (
            <div key={m.id} className="flex justify-end">
              <div className="bubble-user">{text}</div>
            </div>
          );
        }
        return (
          <div key={m.id} className="assistant">
            {m.parts.map((part, j) => {
              if (part.type === "reasoning") {
                return (
                  <Thinking
                    key={j}
                    text={part.text}
                    streaming={busy && isLast && part.state !== "done"}
                  />
                );
              }
              if (part.type === "text") {
                return (
                  <Streamdown
                    key={j}
                    className="prose-cot"
                    plugins={{ code }}
                    isAnimating={busy && isLast}
                  >
                    {part.text}
                  </Streamdown>
                );
              }
              if (isToolUIPart(part)) {
                return (
                  <ToolChip
                    key={j}
                    part={part}
                    labels={toolLabels}
                    onApproval={onApproval}
                  />
                );
              }
              return null;
            })}
          </div>
        );
      })}
      {waiting && <TypingDots />}
    </div>
  );
}
