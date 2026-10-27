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
    const agent = new PiAgent({
      initialState: {
        systemPrompt: buildPiSystemPrompt(
          await memory.getPersona(),
          await memory.getMemories()
        ),
        model: workersAiModel(this.env),
        thinkingLevel: "off",
        tools: piTools(this, memory),
        messages: toPiMessages(this.messages)
      },
      sessionId: this.name,
      getApiKey: () => this.env.CLOUDFLARE_API_KEY
    });
    options?.abortSignal?.addEventListener("abort", () => agent.abort());

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
