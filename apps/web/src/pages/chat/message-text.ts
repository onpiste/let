import type { UIMessage } from "ai";

import { makeReplyQuote, type ReplyQuote } from "@cot/shared";

const INLINE_FILE = /<file name="([^"]*)">\n[\s\S]*?\n<\/file>\n?/g;

/** A user message's typed text plus the names of the files attached to it. */
export function userContent(m: UIMessage) {
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

/** An assistant message's answer text, for copying and sharing. */
export function assistantText(m: UIMessage) {
  return m.parts
    .flatMap((p) => (p.type === "text" ? [p.text.trim()] : []))
    .filter(Boolean)
    .join("\n\n");
}

/** The quote a reply to this message carries (ReplyQuote.swift `make`). */
export function replyQuoteFor(m: UIMessage): ReplyQuote | null {
  if (m.role === "user") {
    const { text, files } = userContent(m);
    return makeReplyQuote(m.id, "user", text || files.join(", "));
  }
  return makeReplyQuote(m.id, "assistant", assistantText(m));
}
