import type { Agent as PiAgent } from "@mariozechner/pi-agent-core";
import type { UIMessageStreamWriter } from "ai";

import { resultText } from "./transcript";

/**
 * Translates Pi's agent events into the AI SDK UI message stream, which is
 * what AIChatAgent persists and the web client renders.
 */
export function forwardPiEvents(agent: PiAgent, writer: UIMessageStreamWriter) {
  let part = 0;
  let partId = "";
  agent.subscribe((event) => {
    switch (event.type) {
      case "turn_start":
        writer.write({ type: "start-step" });
        break;
      case "turn_end":
        writer.write({ type: "finish-step" });
        break;
      case "message_update": {
        const e = event.assistantMessageEvent;
        if (e.type === "text_start" || e.type === "thinking_start") {
          partId = `p${part++}`;
        }
        if (e.type === "text_start") {
          writer.write({ type: "text-start", id: partId });
        } else if (e.type === "text_delta") {
          writer.write({
            type: "text-delta",
            id: partId,
            delta: e.delta
          });
        } else if (e.type === "text_end") {
          writer.write({ type: "text-end", id: partId });
        } else if (e.type === "thinking_start") {
          writer.write({ type: "reasoning-start", id: partId });
        } else if (e.type === "thinking_delta") {
          writer.write({
            type: "reasoning-delta",
            id: partId,
            delta: e.delta
          });
        } else if (e.type === "thinking_end") {
          writer.write({ type: "reasoning-end", id: partId });
        } else if (e.type === "error" && e.reason === "error") {
          writer.write({
            type: "error",
            errorText: e.error.errorMessage ?? "Model request failed"
          });
        }
        break;
      }
      case "tool_execution_start":
        writer.write({
          type: "tool-input-available",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.args
        });
        break;
      case "tool_execution_end":
        writer.write(
          event.isError
            ? {
                type: "tool-output-error",
                toolCallId: event.toolCallId,
                errorText: resultText(event.result)
              }
            : {
                type: "tool-output-available",
                toolCallId: event.toolCallId,
                output: resultText(event.result)
              }
        );
        break;
      default:
        // Lifecycle events carry nothing the chat stream needs.
        break;
    }
  });
}
