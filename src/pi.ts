import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  Agent as PiAgent,
  type AgentMessage,
  type AgentTool
} from "@mariozechner/pi-agent-core";
import { Type, type Model, type TSchema } from "@mariozechner/pi-ai";
import { getSchedulePrompt } from "agents/schedule";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage
} from "ai";
import { PERSONA } from "./prompt";
import {
  broadcastReminder,
  cancelReminder,
  listReminders,
  setReminder
} from "./reminders";

type Memory = { id: number; content: string };

const MODEL_ID = "@cf/moonshotai/kimi-k2.7-code";

/**
 * The same assistant on the Pi harness (@mariozechner/pi-agent-core).
 *
 * AIChatAgent still owns the chat protocol and message persistence, so the
 * client talks to it exactly like the Think assistant. Each turn rebuilds a
 * Pi agent from the stored transcript, lets Pi run the agentic loop, and
 * translates Pi's events into the AI SDK UI message stream.
 */
export class PiAssistant extends AIChatAgent<Env> {
  maxPersistedMessages = 200;

  onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`;
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const agent = new PiAgent({
      initialState: {
        systemPrompt: this.systemPrompt(),
        model: this.model(),
        thinkingLevel: "off",
        tools: this.tools(),
        messages: toPiMessages(this.messages)
      },
      sessionId: this.name,
      getApiKey: () => this.env.CLOUDFLARE_API_KEY
    });
    options?.abortSignal?.addEventListener("abort", () => agent.abort());

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
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
          }
        });
        // The new user message is already the last one in the transcript.
        await agent.continue();
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  async executeTask(description: string) {
    broadcastReminder(this, description);
  }

  private model(): Model<"openai-completions"> {
    return {
      id: MODEL_ID,
      name: "Kimi K2.7 Code",
      api: "openai-completions",
      provider: "cloudflare-workers-ai",
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
      compat: { sendSessionAffinityHeaders: true },
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 256_000,
      maxTokens: 32_000
    };
  }

  private systemPrompt() {
    const memories = this
      .sql<Memory>`SELECT id, content FROM memories ORDER BY id`;
    const memoryBlock =
      memories.length > 0
        ? memories.map((m) => `- [${m.id}] ${m.content}`).join("\n")
        : "(nothing yet)";
    return `${PERSONA}

You have a long-term memory about the user. When they share something worth remembering (name, preferences, people in their life, goals, ongoing projects, important dates), save it with the remember tool without asking. Use what you know naturally — don't recite the memory back. If something you remembered is no longer true, forget it and remember the new fact.

What you remember about the user:
${memoryBlock}

When the user asks to be reminded of something, use the scheduleTask tool.`;
  }

  private tools(): AgentTool[] {
    const tool = <P extends TSchema>(t: AgentTool<P>) =>
      t as unknown as AgentTool;
    return [
      tool({
        name: "remember",
        label: "Remember",
        description:
          "Save a durable fact about the user to long-term memory (preferences, people, goals, dates, etc).",
        parameters: Type.Object({
          content: Type.String({
            description: "One short, self-contained fact about the user"
          })
        }),
        execute: async (_id, { content }) => {
          this.sql`INSERT INTO memories (content) VALUES (${content})`;
          return text(`Remembered: ${content}`);
        }
      }),
      tool({
        name: "forget",
        label: "Forget",
        description: "Delete a memory by its id when it is wrong or outdated.",
        parameters: Type.Object({
          id: Type.Number({ description: "The memory id shown in brackets" })
        }),
        execute: async (_id, { id }) => {
          this.sql`DELETE FROM memories WHERE id = ${id}`;
          return text(`Forgot memory ${id}.`);
        }
      }),
      tool({
        name: "scheduleTask",
        label: "Schedule reminder",
        description: `Schedule a reminder. Use this when the user asks to be reminded or wants something done later. Give exactly one of date, delayInSeconds or cron.

${getSchedulePrompt({ date: new Date() })}`,
        parameters: Type.Object({
          description: Type.String({ description: "What to remind about" }),
          date: Type.Optional(
            Type.String({ description: "ISO date-time for a one-off reminder" })
          ),
          delayInSeconds: Type.Optional(
            Type.Number({ description: "Seconds from now" })
          ),
          cron: Type.Optional(
            Type.String({ description: "Cron expression for a repeating one" })
          )
        }),
        execute: async (_id, { description, date, delayInSeconds, cron }) => {
          const when = date ? new Date(date) : (delayInSeconds ?? cron);
          if (when === undefined) {
            throw new Error("Give one of date, delayInSeconds or cron");
          }
          return text(setReminder(this, when, description));
        }
      }),
      tool({
        name: "getScheduledTasks",
        label: "List reminders",
        description: "List all scheduled reminders",
        parameters: Type.Object({}),
        execute: async () => text(JSON.stringify(listReminders(this)))
      }),
      tool({
        name: "cancelScheduledTask",
        label: "Cancel reminder",
        description: "Cancel a scheduled reminder by its ID",
        parameters: Type.Object({
          taskId: Type.String({ description: "The ID of the task to cancel" })
        }),
        execute: async (_id, { taskId }) => text(cancelReminder(this, taskId))
      })
    ];
  }
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {} };
}

function resultText(result: { content?: { type: string; text?: string }[] }) {
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
function toPiMessages(messages: UIMessage[]): AgentMessage[] {
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
