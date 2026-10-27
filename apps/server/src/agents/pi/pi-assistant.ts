import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { Agent as PiAgent } from "@mariozechner/pi-agent-core";
import { getAgentByName } from "agents";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { broadcastReminder } from "../common/reminders";
import { workersAiModel } from "./model";
import { buildPiSystemPrompt } from "./system-prompt";
import { piTools } from "./tools";
import { toPiMessages } from "./transcript";
import { forwardPiEvents } from "./ui-stream";

/** Same bound on tool-call rounds per turn as Think's default `maxSteps`. */
const MAX_STEPS = 10;

/** A reply that doesn't call the model, e.g. when over a usage limit. */
function cannedResponse(text: string) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "text-start", id: "t" });
      writer.write({ type: "text-delta", id: "t", delta: text });
      writer.write({ type: "text-end", id: "t" });
    }
  });
  return createUIMessageStreamResponse({ stream });
}

/**
 * The same assistant on the Pi harness (@mariozechner/pi-agent-core).
 *
 * AIChatAgent still owns the chat protocol and message persistence, so the
 * client talks to it exactly like the Think assistant. Each turn rebuilds a
 * Pi agent from the stored transcript, lets Pi run the agentic loop, and
 * translates Pi's events into the AI SDK UI message stream.
 *
 * Memory is not stored here: it lives in the same user's Think assistant,
 * so both harnesses share one memory.
 */
export class PiAssistant extends AIChatAgent<Env> {
  override maxPersistedMessages = 200;

  override async onChatMessage(
    _onFinish: unknown,
    options?: OnChatMessageOptions
  ) {
    const memory = await getAgentByName(this.env.Assistant, this.name);
    // Pi always runs on the deployment's Workers AI key, so it always counts.
    const refusal = await memory.countTurn(false);
    if (refusal) return cannedResponse(refusal);

    const agent = new PiAgent({
      initialState: {
        systemPrompt: buildPiSystemPrompt(
          await memory.getPersona(),
          await memory.getMemories()
        ),
        model: workersAiModel(this.env),
        thinkingLevel: "off",
        tools: piTools(this, memory, this.env),
        messages: toPiMessages(this.messages)
      },
      sessionId: this.name,
      getApiKey: () => this.env.CLOUDFLARE_API_KEY
    });
    options?.abortSignal?.addEventListener("abort", () => agent.abort());
    let steps = 0;
    agent.subscribe((event) => {
      if (event.type === "turn_end" && ++steps >= MAX_STEPS) agent.abort();
    });

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        forwardPiEvents(agent, writer);
        // The new user message is already the last one in the transcript.
        await agent.continue();
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  async executeTask(description: string) {
    broadcastReminder(this, description);
    const assistant = await getAgentByName(this.env.Assistant, this.name);
    await assistant.sendTelegramReminder(description);
  }
}
