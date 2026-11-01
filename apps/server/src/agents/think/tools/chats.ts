import { tool } from "ai";
import { z } from "zod";

import type { ChatHit } from "../chat-index";

export type ChatReader = {
  /** Hits outside the chat the model is in. */
  searchChats(query: string): Promise<ChatHit[]>;
  readChat(id: string, seq: number): Promise<string>;
};

/** Look things up in the user's earlier conversations (see chat-index.ts). */
export function chatTools(chats: ChatReader) {
  return {
    searchChats: tool({
      description:
        "Search the user's earlier conversations (not the current one) for messages containing the given keywords. Returns snippets with each chat's title, date, chatId and the message's seq. Use it when the user refers to something discussed before that is neither in this chat nor in your memory.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "A few distinctive keywords separated by spaces, in the language the earlier chat was likely in; not a whole question"
          )
      }),
      execute: async ({ query }) => {
        try {
          const hits = await chats.searchChats(query);
          return hits.length ? hits : "No earlier chat mentions that.";
        } catch (error) {
          return `Error searching earlier chats: ${String(error)}`;
        }
      }
    }),

    readChat: tool({
      description:
        "Read the messages around a searchChats hit in an earlier conversation.",
      inputSchema: z.object({
        chatId: z.string().describe("The chatId from searchChats"),
        seq: z.number().int().min(0).describe("The seq from searchChats")
      }),
      execute: async ({ chatId, seq }) => {
        try {
          return await chats.readChat(chatId, seq);
        } catch (error) {
          return `Error reading that chat: ${String(error)}`;
        }
      }
    })
  };
}
