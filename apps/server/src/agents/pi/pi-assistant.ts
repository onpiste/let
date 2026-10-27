import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { Agent as PiAgent } from "@mariozechner/pi-agent-core";
import { getAgentByName } from "agents";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import type { ServerEvent } from "@cot/shared";

import {
  broadcastEvent,
  cancelOwnJob,
  listOwnJobs,
  toJob,
  type JobPayload
} from "../common/jobs";
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
 * Memory and scheduled jobs are not stored here: they live in the same
 * user's Think assistant, so both harnesses share them.
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
          await memory.getMemories(),
          await memory.getTimeNote()
        ),
        model: workersAiModel(this.env),
        thinkingLevel: "off",
        tools: piTools(memory),
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

  /** Shows a fired job, sent by the Think assistant, in open Pi chats. */
  async notify(event: ServerEvent) {
    broadcastEvent(this, event);
  }

  // Reminders scheduled here before jobs moved to the Think assistant. They
  // still fire here, and the Think assistant lists and cancels them.

  async executeTask(payload: JobPayload) {
    const { description } = toJob(payload);
    broadcastEvent(this, {
      type: "reminder",
      description,
      timestamp: new Date().toISOString()
    });
    const assistant = await getAgentByName(this.env.Assistant, this.name);
    await assistant.sendToTelegramOwner(`⏰ Reminder: ${description}`);
  }

  async listOwnJobs() {
    return listOwnJobs(this, "pi");
  }

  async cancelOwnJob(id: string) {
    return cancelOwnJob(this, id);
  }
}
