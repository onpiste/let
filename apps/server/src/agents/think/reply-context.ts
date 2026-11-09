import type { ModelMessage, UIMessage } from "ai";

import { messageReplyTo, replyContextText } from "@cot/shared";

function uiText(message: UIMessage) {
  return message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

/** Whether a model message carries a file or image (a file-only reply). */
function hasFile(message: ModelMessage) {
  return (
    typeof message.content !== "string" &&
    message.content.some((p) => p.type === "file" || p.type === "image")
  );
}

function modelText(message: ModelMessage) {
  if (typeof message.content === "string") return message.content;
  return message.content.map((p) => (p.type === "text" ? p.text : "")).join("");
}

/**
 * Puts the message a user replied to (`metadata.replyTo`, see
 * `@cot/shared` reply.ts) in front of their reply, as the model sees it.
 * Metadata never reaches the model on its own, so without this a follow-up
 * like "why?" would be read against the last answer, not the quoted one.
 *
 * Think's model messages may drop the oldest messages to fit the context
 * and may add a user message of its own at the end (a context reminder), so
 * each user message is found by its text, walking both lists from the end.
 * Its text may gain a reminder at the end, hence `startsWith`. Returns
 * undefined when nothing in view is a reply, leaving Think's list as it is.
 */
export function withReplyContext(
  ui: readonly UIMessage[],
  model: readonly ModelMessage[]
): ModelMessage[] | undefined {
  const out = [...model];
  let changed = false;
  let next = out.length;
  for (let i = ui.length - 1; i >= 0; i--) {
    const message = ui[i];
    if (message?.role !== "user") continue;
    const text = uiText(message);
    let k = next - 1;
    for (; k >= 0; k--) {
      const candidate = out[k];
      if (candidate?.role !== "user") continue;
      // A message with no text (only attachments) must match one with a
      // file, not whichever user message comes first.
      if (text ? modelText(candidate).startsWith(text) : hasFile(candidate)) {
        break;
      }
    }
    if (k < 0) break;
    next = k;
    const quote = messageReplyTo(message);
    const target = out[k];
    if (!quote || target?.role !== "user") continue;
    const context = { type: "text" as const, text: replyContextText(quote) };
    out[k] = {
      ...target,
      content:
        typeof target.content === "string"
          ? [context, { type: "text", text: target.content }]
          : [context, ...target.content]
    };
    changed = true;
  }
  return changed ? out : undefined;
}
