import { code } from "@streamdown/code";
import { isToolUIPart, type UIMessage } from "ai";
import { Fragment, useState } from "react";
import { Streamdown } from "streamdown";

import {
  messageCreatedAt,
  messageReplyTo,
  needsTimeDivider,
  type ReplyQuote
} from "@cot/shared";

import { MessageActions } from "./message-actions";
import { MessageEdit } from "./message-edit";
import { assistantText, replyQuoteFor, userContent } from "./message-text";
import { messageAnchor, QuotedMessage } from "./reply-quote";
import { Thinking, TypingDots } from "./thinking";
import { TimeDivider } from "./time-divider";
import { ToolChip } from "./tool-chip";

/** One turn: a user bubble, or the assistant's text, reasoning and tools. */
function Message({
  m,
  isLast,
  busy,
  toolLabels,
  onApproval,
  onReply,
  onEdit,
  onRegenerate
}: {
  m: UIMessage;
  isLast: boolean;
  busy: boolean;
  toolLabels: Record<string, string>;
  onApproval: (id: string, approved: boolean) => void;
  onReply: (quote: ReplyQuote) => void;
  onEdit: (id: string, text: string) => void;
  onRegenerate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const quote = replyQuoteFor(m);
  const reply = quote ? () => onReply(quote) : undefined;
  if (m.role === "user") {
    const { text, files } = userContent(m);
    const replyTo = messageReplyTo(m);
    if (editing) {
      return (
        <div key={m.id} className="message flex flex-col items-end gap-1">
          <MessageEdit
            text={text}
            hasFiles={files.length > 0}
            onCancel={() => setEditing(false)}
            onSave={(edited) => {
              setEditing(false);
              onEdit(m.id, edited);
            }}
          />
        </div>
      );
    }
    return (
      <div
        key={m.id}
        id={messageAnchor(m.id)}
        className="message flex flex-col items-end gap-1"
      >
        {replyTo && <QuotedMessage quote={replyTo} />}
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
        {quote && (
          <MessageActions
            text={text || files.join(", ")}
            align="end"
            onReply={reply}
            // Not mid-reply: the edit would race the turn still running.
            onEdit={busy || !text ? undefined : () => setEditing(true)}
          />
        )}
      </div>
    );
  }
  const answer = assistantText(m);
  const streaming = busy && isLast;
  return (
    <div key={m.id} id={messageAnchor(m.id)} className="message assistant">
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
              isAnimating={streaming}
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
      {answer && !streaming && (
        <MessageActions
          text={answer}
          onReply={reply}
          onRegenerate={isLast && !busy ? onRegenerate : undefined}
        />
      )}
    </div>
  );
}

/** The conversation, with the time shown after a long pause. */
export function MessageList({
  messages,
  busy,
  waiting,
  toolLabels,
  onApproval,
  onReply,
  onEdit,
  onRegenerate
}: {
  messages: UIMessage[];
  /** A turn is streaming; the last message may still change. */
  busy: boolean;
  /** Waiting for the assistant's first token. */
  waiting: boolean;
  toolLabels: Record<string, string>;
  onApproval: (id: string, approved: boolean) => void;
  /** Quote this message in the composer for a follow-up. */
  onReply: (quote: ReplyQuote) => void;
  /** Replaces a user message and everything after it with a new answer. */
  onEdit: (id: string, text: string) => void;
  /** Answers the last user message again, replacing the last reply. */
  onRegenerate: () => void;
}) {
  return (
    <div className="messages">
      {messages.map((m, i) => {
        const at = messageCreatedAt(m);
        const previous = messages[i - 1];
        const divider =
          at !== undefined &&
          previous !== undefined &&
          needsTimeDivider(messageCreatedAt(previous), at);
        return (
          <Fragment key={m.id}>
            {divider && <TimeDivider at={at} />}
            <Message
              m={m}
              isLast={i === messages.length - 1}
              busy={busy}
              toolLabels={toolLabels}
              onApproval={onApproval}
              onReply={onReply}
              onEdit={onEdit}
              onRegenerate={onRegenerate}
            />
          </Fragment>
        );
      })}
      {waiting && <TypingDots />}
    </div>
  );
}
