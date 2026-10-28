import { code } from "@streamdown/code";
import { isToolUIPart, type UIMessage } from "ai";
import { Streamdown } from "streamdown";

import { Thinking, TypingDots } from "./thinking";
import { ToolChip } from "./tool-chip";

const INLINE_FILE = /<file name="([^"]*)">\n[\s\S]*?\n<\/file>\n?/g;

/** A user message's typed text plus the names of the files attached to it. */
function userContent(m: UIMessage) {
  const files: string[] = [];
  let text = "";
  for (const p of m.parts) {
    if (p.type === "file") files.push(p.filename ?? "file");
    if (p.type !== "text") continue;
    // Text files travel inline; show them as chips, not as a wall of text.
    text += p.text.replace(INLINE_FILE, (_, name: string) => {
      files.push(name);
      return "";
    });
  }
  return { text: text.trim(), files };
}

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
          const { text, files } = userContent(m);
          return (
            <div key={m.id} className="flex flex-col items-end gap-1">
              {files.length > 0 && (
                <div className="attachments justify-end">
                  {files.map((f, k) => (
                    <span className="chip-file" key={k}>
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {text && <div className="bubble-user">{text}</div>}
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
