import type { UIMessage } from "ai";

import { CHAT_QUERY_LENGTH, searchSnippet } from "@cot/shared";

import { INLINE_FILE } from "./chat-index";

/** Callable arguments arrive untyped from the client. */
export function checkQuery(query: unknown) {
  if (typeof query !== "string" || query.length > CHAT_QUERY_LENGTH) {
    throw new Error("Bad search.");
  }
  return query.trim();
}

/** What the user and assistant said, with pasted files as their names. */
function messageText(message: UIMessage) {
  return message.parts
    .map((part) =>
      part.type === "text"
        ? part.text.replace(INLINE_FILE, (_, name: string) => `${name} `)
        : ""
    )
    .join(" ");
}

/**
 * The snippet around the first match in a chat, given its messages (the
 * active chat) or the indexed text that matched (a saved one): "" when only
 * the title matches, null when nothing does.
 */
export function chatMatch(
  title: string,
  content: UIMessage[] | string | undefined,
  query: string
): string | null {
  const texts =
    typeof content === "string" ? [content] : (content ?? []).map(messageText);
  for (const text of texts) {
    const snippet = searchSnippet(text, query);
    if (snippet) return snippet;
  }
  return searchSnippet(title, query) ? "" : null;
}
