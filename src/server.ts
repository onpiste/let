import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { Think } from "@cloudflare/think";
import {
  ThinkMessengerStateAgent,
  type ThinkMessengers
} from "@cloudflare/think/messengers";
import telegramMessenger from "@cloudflare/think/messengers/telegram";
import { callable, getAgentByName } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { tool, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import {
  getUserFromRequest,
  handleCallback,
  handleLogin,
  handleLogout,
  jsonResponse
} from "./auth";
import { formatMemories, type Memory } from "./prompt";
import {
  broadcastReminder,
  cancelReminder,
  listReminders,
  setReminder
} from "./reminders";
import {
  applySettingsPatch,
  buildPersona,
  DEFAULT_SETTINGS,
  toPublicSettings,
  type Settings,
  type SettingsPatch
} from "./settings";
import {
  callTelegram,
  handleTelegramApi,
  handleTelegramWebhook,
  links,
  TELEGRAM_WEBHOOK_PATH
} from "./telegram";

export { PiAssistant } from "./pi";
export { TelegramLinks } from "./telegram";
// Backs the Chat SDK state of the Telegram messenger as a sub-agent facet.
export { ThinkMessengerStateAgent };

/** Where MCP servers send the user back after OAuth; routed like /chat. */
const MCP_CALLBACK_PATH = "chat/mcp-callback";

/**
 * A personal assistant. Each signed-in Google account gets its own Durable
 * Object instance, which keeps the chat history, long-term memories and
 * scheduled reminders for that person. Its memories are also the memory of
 * the same person's Pi assistant, which reads and writes them over RPC.
 *
 * Think runs the agentic loop, persists the conversation and resumes
 * interrupted turns; this class only supplies the model, prompt and tools.
 * A linked Telegram chat shares this same conversation (see telegram.ts).
 */
export class Assistant extends Think<Env> {
  onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`;
    this.sql`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`;

    // MCP OAuth opens in a popup; close it and let the settings page pick
    // up the new connection state from the MCP broadcast.
    this.mcp.configureOAuthCallback({
      customHandler: (result) =>
        new Response(
          result.authSuccess
            ? "<script>window.close()</script>Connected. You can close this window."
            : `Authorization failed: ${result.authError ?? "unknown error"}`,
          {
            status: result.authSuccess ? 200 : 400,
            headers: { "Content-Type": "text/html; charset=utf-8" }
          }
        )
    });
  }

  // Settings, edited from the settings page over this agent's WebSocket.
  // Only the signed-in owner can reach this instance (see the Worker).

  private getSettingsRow(): Settings {
    const [row] = this.sql<{ value: string }>`
      SELECT value FROM settings WHERE key = 'settings'`;
    return row
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<Settings>) }
      : DEFAULT_SETTINGS;
  }

  @callable()
  async getSettings() {
    return toPublicSettings(this.getSettingsRow());
  }

  @callable()
  async updateSettings(patch: SettingsPatch) {
    const next = applySettingsPatch(this.getSettingsRow(), patch);
    this.sql`INSERT OR REPLACE INTO settings (key, value)
      VALUES ('settings', ${JSON.stringify(next)})`;
    return toPublicSettings(next);
  }

  /** The persona text, also used by the Pi assistant over RPC. */
  async getPersona() {
    return buildPersona(this.getSettingsRow());
  }

  // MCP servers. Think adds connected servers' tools to every turn.

  @callable()
  async addMcp(name: string, url: string) {
    if (!name.trim()) throw new Error("Give the server a name.");
    if (!/^https?:\/\//.test(url)) throw new Error("Enter an http(s) URL.");
    return this.addMcpServer(name.trim(), url.trim(), {
      callbackPath: MCP_CALLBACK_PATH
    });
  }

  @callable()
  async removeMcp(id: string) {
    await this.removeMcpServer(id);
  }

  // Telegram. The Worker only forwards updates from the Telegram account
  // linked to this assistant; Think's messenger runtime replies in the same
  // conversation as the web chat.

  getMessengers(): ThinkMessengers {
    return {
      telegram: telegramMessenger({
        token: this.env.TELEGRAM_BOT_TOKEN,
        userName: this.env.TELEGRAM_BOT_USERNAME,
        secretToken: this.env.TELEGRAM_WEBHOOK_SECRET_TOKEN,
        apiBaseUrl: this.env.TELEGRAM_API_BASE_URL || undefined,
        conversation: "self",
        respondTo: ["direct-message"]
      })
    };
  }

  /**
   * Sends a fired reminder to the Telegram account currently linked to this
   * assistant, if any. Looked up at send time so a re-link takes effect.
   */
  async sendTelegramReminder(description: string) {
    const userId = this.name.slice("google:".length);
    const chatId = await links(this.env).telegramFor(userId);
    if (!chatId) return;
    try {
      await callTelegram(this.env, "sendMessage", {
        chat_id: chatId,
        text: `⏰ Reminder: ${description}`
      });
    } catch (error) {
      console.error(error);
    }
  }

  // Memory API, shared with the Pi assistant over RPC.

  async getMemories() {
    return this.sql<Memory>`SELECT id, content FROM memories ORDER BY id`;
  }

  async addMemory(content: string) {
    this.sql`INSERT INTO memories (content) VALUES (${content})`;
  }

  async removeMemory(id: number) {
    this.sql`DELETE FROM memories WHERE id = ${id}`;
  }

  getModel(): string | LanguageModel {
    const { provider, model, apiKeys } = this.getSettingsRow();
    switch (provider) {
      case "workers-ai":
        return model;
      case "openai":
        return createOpenAI({ apiKey: apiKeys.openai })(model);
      case "anthropic":
        return createAnthropic({ apiKey: apiKeys.anthropic })(model);
      case "google":
        return createGoogleGenerativeAI({ apiKey: apiKeys.google })(model);
    }
  }

  // Called every turn (no context blocks are configured), so the memory list
  // and the current date are always fresh.
  getSystemPrompt() {
    const memories = this
      .sql<Memory>`SELECT id, content FROM memories ORDER BY id`;
    return `${buildPersona(this.getSettingsRow())}

You have a long-term memory about the user. When they share something worth remembering (name, preferences, people in their life, goals, ongoing projects, important dates), save it with the remember tool without asking. Use what you know naturally — don't recite the memory back. If something you remembered is no longer true, forget it and remember the new fact.

What you remember about the user:
${formatMemories(memories)}

${getSchedulePrompt({ date: new Date() })}

When the user asks to be reminded of something, use the scheduleTask tool.`;
  }

  getTools(): ToolSet {
    return {
      remember: tool({
        description:
          "Save a durable fact about the user to long-term memory (preferences, people, goals, dates, etc).",
        inputSchema: z.object({
          content: z
            .string()
            .describe("One short, self-contained fact about the user")
        }),
        execute: async ({ content }) => {
          await this.addMemory(content);
          return `Remembered: ${content}`;
        }
      }),

      forget: tool({
        description: "Delete a memory by its id when it is wrong or outdated.",
        inputSchema: z.object({
          id: z.number().describe("The memory id shown in brackets")
        }),
        execute: async ({ id }) => {
          await this.removeMemory(id);
          return `Forgot memory ${id}.`;
        }
      }),

      scheduleTask: tool({
        description:
          "Schedule a reminder. Use this when the user asks to be reminded or wants something done later.",
        inputSchema: scheduleSchema,
        execute: async ({ when, description }) => {
          if (when.type === "no-schedule") {
            return "Not a valid schedule input";
          }
          const input =
            when.type === "scheduled"
              ? when.date
              : when.type === "delayed"
                ? when.delayInSeconds
                : when.type === "cron"
                  ? when.cron
                  : null;
          if (!input) return "Invalid schedule type";
          try {
            return await setReminder(this, input, description);
          } catch (error) {
            return `Error scheduling task: ${error}`;
          }
        }
      }),

      getScheduledTasks: tool({
        description: "List all scheduled reminders",
        inputSchema: z.object({}),
        execute: async () => listReminders(this)
      }),

      cancelScheduledTask: tool({
        description: "Cancel a scheduled reminder by its ID",
        inputSchema: z.object({
          taskId: z.string().describe("The ID of the task to cancel")
        }),
        execute: async ({ taskId }) => {
          try {
            return await cancelReminder(this, taskId);
          } catch (error) {
            return `Error cancelling reminder: ${error}`;
          }
        }
      })
    };
  }

  async executeTask(description: string) {
    broadcastReminder(this, description);
    await this.sendTelegramReminder(description);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/auth/login") return handleLogin(request, env);
      if (url.pathname === "/auth/callback") {
        return await handleCallback(request, env);
      }
      if (url.pathname === "/auth/logout") {
        if (request.method !== "POST") {
          return new Response("Method not allowed", { status: 405 });
        }
        return handleLogout(request);
      }
      if (url.pathname === TELEGRAM_WEBHOOK_PATH) {
        return await handleTelegramWebhook(request, env);
      }
      if (url.pathname.startsWith("/telegram/")) {
        const user = await getUserFromRequest(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        return await handleTelegramApi(request, env, user);
      }
      if (url.pathname === "/auth/me") {
        const user = await getUserFromRequest(request, env);
        return user
          ? jsonResponse(user)
          : jsonResponse({ error: "Unauthorized" }, { status: 401 });
      }

      // The Worker, not the browser, decides which assistant instance a
      // request reaches. There is deliberately no generic /agents/* route.
      // /chat is the Think assistant, /pi the Pi one; both are keyed by the
      // same account, so they share its memory.
      const harness = url.pathname.split("/")[1];
      if (harness === "chat" || harness === "pi") {
        const user = await getUserFromRequest(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const name = `google:${user.id}`;
        const agent =
          harness === "chat"
            ? await getAgentByName(env.Assistant, name)
            : await getAgentByName(env.PiAssistant, name);
        return agent.fetch(request);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error";
      return jsonResponse({ error: message }, { status: 500 });
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
