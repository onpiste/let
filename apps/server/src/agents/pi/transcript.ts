import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { UIMessage } from "ai";

import { MODEL_ID } from "./model";

/** The text of a Pi tool result, for the UI stream. */
export function resultText(result: {
  content?: { type: string; text?: string }[];
}) {
  return (result.content ?? [])
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();
}

/**
 * Rebuild Pi's transcript from the persisted UI messages. Only text is
 * carried over: tool calls from earlier turns have already done their work,
 * and their effects (memories, reminders) are reachable through the tools.
 */
export function toPiMessages(messages: UIMessage[]): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (const m of messages) {
    const content = m.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (!content) continue;
    const timestamp = Date.now();
    if (m.role === "user") {
      out.push({ role: "user", content, timestamp });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: [{ type: "text", text: content }],
        api: "openai-completions",
        provider: "cloudflare-workers-ai",
        model: MODEL_ID,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
        },
        stopReason: "stop",
        timestamp
      });
    }
  }
  return out;
}
