import { CHAT_QUERY_LENGTH, searchSnippet } from "@cot/shared";

/** Callable arguments arrive untyped from the client. */
export function checkQuery(query: unknown) {
  if (typeof query !== "string" || query.length > CHAT_QUERY_LENGTH) {
    throw new Error("Bad search.");
  }
  return query.trim();
}

/**
 * The snippet around the first match in a chat, given the indexed text that
 * matched: "" when only the title matches, null when nothing does.
 */
export function chatMatch(
  title: string,
  text: string | undefined,
  query: string
): string | null {
  const snippet = text === undefined ? null : searchSnippet(text, query);
  if (snippet) return snippet;
  return searchSnippet(title, query) ? "" : null;
}
