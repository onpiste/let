import type { UIMessage } from "ai";

import { editedParts, messageReplyTo } from "@cot/shared";

/**
 * Where an edit of the user message `messageId` goes, and what it says.
 *
 * Think keeps a chat as a tree and shows the path to the newest message, so
 * the edit is a new message beside the old one, under the message before
 * it: the conversation continues from there and the old message, with
 * everything after it, drops out of view. The client's regenerate request
 * then answers it on that branch.
 */
export function editTarget(
  messages: UIMessage[],
  messageId: unknown,
  text: unknown
) {
  // Callable arguments arrive untyped from the client.
  if (typeof messageId !== "string" || typeof text !== "string") {
    throw new Error("Bad edit.");
  }
  const at = messages.findIndex((m) => m.id === messageId);
  const original = messages[at];
  if (original?.role !== "user") {
    throw new Error("That message can't be edited.");
  }
  const parts = editedParts(original.parts, text);
  if (parts.length === 0) throw new Error("A message needs text or a file.");
  // An edited reply still replies to the same message.
  const replyTo = messageReplyTo(original);
  const message: UIMessage = {
    id: crypto.randomUUID(),
    role: "user",
    parts,
    metadata: { createdAt: Date.now(), ...(replyTo && { replyTo }) }
  };
  return { parentId: messages[at - 1]?.id ?? null, message };
}
