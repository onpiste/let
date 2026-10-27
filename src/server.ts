import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  Think,
  type ThinkSubmissionInspection,
  type TurnContext
} from "@cloudflare/think";
import {
  ThinkMessengerStateAgent,
  type ThinkMessengers
} from "@cloudflare/think/messengers";
import telegramMessenger from "@cloudflare/think/messengers/telegram";
import {
  callable,
  getAgentByName,
  getCurrentAgent,
  type Schedule
} from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { tool, type LanguageModel, type ToolSet, type UIMessage } from "ai";
import { z } from "zod";
import {
  getUserFromRequest,
  handleCallback,
  handleLogin,
  handleLogout,
  isAllowed,
  jsonResponse
} from "./auth";
import { browsePage } from "./browser";
import { runCode } from "./code-runner";
import { formatMemories, type Memory } from "./prompt";
import {
  byNextRun,
  isJobSchedule,
  JOB_CALLBACK,
  SCHEDULE_TOOL_DESCRIPTION,
  SCHEDULED_TASK_SOURCE,
  timeNote,
  toJob,
  toJobInfo,
  type Job,
  type JobInfo,
  type JobNotice,
  type JobPayload,
  type NewJob
} from "./schedules";
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
  gateUpdate,
  handleTelegramWebhook,
  newClaim,
  randomHex,
  routes,
  sendText,
  toTelegramStatus,
  webhookPath,
  type TelegramConfig
} from "./telegram";

export { PiAssistant } from "./pi";
export { Sandbox } from "./sandbox";
export { TelegramRoutes } from "./telegram";
// Backs the Chat SDK state of the Telegram messenger as a sub-agent facet.
export { ThinkMessengerStateAgent };

/**
 * Tools that wait for the user to approve them in the chat. Telegram has no
 * approval buttons, so these are withheld from Telegram turns.
 */
const NEEDS_APPROVAL = ["runCommand", "writeSandboxFile"];

/** The AI Search instance (in the default namespace) holding the knowledge base. */
const KNOWLEDGE_INSTANCE = "cot-knowledge";

/** Where MCP servers send the user back after OAuth; routed like /chat. */
const MCP_CALLBACK_PATH = "chat/mcp-callback";

/** Telegram rejects messages longer than 4096 characters. */
const TELEGRAM_MAX_TEXT = 4000;

function messageText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/**
 * A personal assistant. Each signed-in Google account gets its own Durable
 * Object instance, which keeps the chat history, long-term memories and
 * scheduled jobs for that person. Its memories and jobs are also those of
 * the same person's Pi assistant, which reaches them over RPC.
 *
 * Think runs the agentic loop, persists the conversation and resumes
 * interrupted turns; this class only supplies the model, prompt and tools.
 * The user's own Telegram bot, once connected, shares this same
 * conversation (see telegram.ts).
 */
export class Assistant extends Think<Env> {
  // Think calls getMessengers() before onStart(), so anything that reads
  // these tables first makes sure they exist.
  private ensureTables() {
    this.sql`CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`;
    this.sql`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`;
  }

  onStart() {
    this.ensureTables();

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

  /**
   * The owner's email and time zone, recorded by the Worker on every web
   * connection.
   */
  async setOwner(email: string, timezone: string | null) {
    this.ensureTables();
    this.sql`INSERT OR REPLACE INTO settings (key, value)
      VALUES ('owner_email', ${email})`;
    if (timezone) {
      this.sql`INSERT OR REPLACE INTO settings (key, value)
        VALUES ('timezone', ${timezone})`;
    }
  }

  private getTimezone() {
    const [row] = this.sql<{ value: string }>`
      SELECT value FROM settings WHERE key = 'timezone'`;
    return row?.value ?? null;
  }

  /** The current time for the model, also used by the Pi assistant. */
  async getTimeNote() {
    return timeNote(this.getTimezone());
  }

  private ownerAllowed() {
    const [row] = this.sql<{ value: string }>`
      SELECT value FROM settings WHERE key = 'owner_email'`;
    return Boolean(row && isAllowed(row.value, this.env));
  }

  // Telegram: the user's own bot (see telegram.ts). Think reads
  // getMessengers() once at startup, so changing the bot restarts this
  // object to pick it up.

  private getTelegramConfig(): TelegramConfig | null {
    const [row] = this.sql<{ value: string }>`
      SELECT value FROM settings WHERE key = 'telegram'`;
    return row ? (JSON.parse(row.value) as TelegramConfig) : null;
  }

  private saveTelegramConfig(config: TelegramConfig | null) {
    if (config) {
      this.sql`INSERT OR REPLACE INTO settings (key, value)
        VALUES ('telegram', ${JSON.stringify(config)})`;
    } else {
      this.sql`DELETE FROM settings WHERE key = 'telegram'`;
    }
  }

  /** Restart after the current reply goes out so Think re-reads the bot. */
  private restartSoon() {
    setTimeout(() => this.ctx.abort("Telegram bot changed"), 500);
  }

  getMessengers(): ThinkMessengers {
    this.ensureTables();
    const config = this.getTelegramConfig();
    if (!config) return {};
    return {
      telegram: telegramMessenger({
        token: config.token,
        userName: config.botUsername,
        secretToken: config.webhookSecret,
        apiBaseUrl: this.env.TELEGRAM_API_BASE_URL || undefined,
        conversation: "self",
        respondTo: ["direct-message"]
      })
    };
  }

  @callable()
  async getTelegramStatus() {
    return toTelegramStatus(this.getTelegramConfig());
  }

  @callable()
  async connectTelegram(token: string) {
    token = token.trim();
    if (!/^\d+:[\w-]{20,}$/.test(token)) {
      throw new Error("That doesn't look like a bot token from @BotFather.");
    }
    const bot = (await callTelegram(this.env, token, "getMe", {})) as {
      username?: string;
    };
    if (!bot.username) throw new Error("Telegram did not return the bot.");

    const previous = this.getTelegramConfig();
    const config: TelegramConfig = {
      token,
      botUsername: bot.username,
      webhookSecret: randomHex(),
      routeId: randomHex(),
      webhookSet: false,
      ownerId: null,
      ...newClaim()
    };

    // Telegram only delivers to public https:// URLs; on local http dev the
    // bot is saved but its webhook has to be pointed at a tunnel by hand.
    const uri = getCurrentAgent().connection?.uri;
    const origin = uri ? new URL(uri).origin.replace(/^ws/, "http") : null;
    if (origin?.startsWith("https://")) {
      await callTelegram(this.env, token, "setWebhook", {
        url: `${origin}${webhookPath(config.routeId)}`,
        secret_token: config.webhookSecret,
        allowed_updates: ["message", "edited_message", "callback_query"]
      });
      config.webhookSet = true;
    }

    const userId = this.name.slice("google:".length);
    await routes(this.env).set(config.routeId, userId);
    if (previous && previous.token !== token) {
      await callTelegram(this.env, previous.token, "deleteWebhook", {}).catch(
        (error: unknown) => console.error(error)
      );
    }
    this.saveTelegramConfig(config);
    this.restartSoon();
    return toTelegramStatus(config);
  }

  @callable()
  async newTelegramClaimLink() {
    const config = this.getTelegramConfig();
    if (!config) throw new Error("Connect a bot first.");
    const next = { ...config, ownerId: null, ...newClaim() };
    this.saveTelegramConfig(next);
    return toTelegramStatus(next);
  }

  @callable()
  async disconnectTelegram() {
    const config = this.getTelegramConfig();
    if (!config) return toTelegramStatus(null);
    await callTelegram(this.env, config.token, "deleteWebhook", {}).catch(
      (error: unknown) => console.error(error)
    );
    await routes(this.env).remove(this.name.slice("google:".length));
    this.saveTelegramConfig(null);
    this.restartSoon();
    return toTelegramStatus(null);
  }

  /**
   * Called by the Worker for each webhook update. Returns "forward" when the
   * owner sent it and Think's messenger runtime should answer.
   */
  async receiveTelegramUpdate(
    secret: string,
    body: string
  ): Promise<"unauthorized" | "handled" | "forward"> {
    this.ensureTables();
    const config = this.getTelegramConfig();
    if (!config) return "unauthorized";
    const decision = gateUpdate(config, secret, body);
    switch (decision.kind) {
      case "unauthorized":
        return "unauthorized";
      case "ignore":
        return "handled";
      case "claim":
        this.saveTelegramConfig({
          ...config,
          ownerId: decision.ownerId,
          claimCode: null
        });
        await sendText(
          this.env,
          config.token,
          decision.chatId,
          "Connected ✓ This bot now talks to your assistant — same conversation, memory and reminders as the web app."
        );
        return "handled";
      case "reject":
        await sendText(
          this.env,
          config.token,
          decision.chatId,
          "This is a private assistant."
        );
        return "handled";
      case "forward":
        // Removing the owner from ALLOWED_EMAILS also cuts off Telegram.
        return this.ownerAllowed() ? "forward" : "handled";
    }
  }

  /** Sends a message to the owner of the connected bot, if any. */
  async sendToTelegramOwner(text: string) {
    const config = this.getTelegramConfig();
    if (!config?.ownerId) return;
    const clipped =
      text.length > TELEGRAM_MAX_TEXT
        ? `${text.slice(0, TELEGRAM_MAX_TEXT)}…`
        : text;
    await sendText(this.env, config.token, config.ownerId, clipped);
  }

  // Scheduled jobs: reminders, and tasks this assistant runs on its own
  // (see schedules.ts). Both harnesses schedule them here; the settings page
  // lists and edits them.

  private pi() {
    return getAgentByName(this.env.PiAssistant, this.name);
  }

  async scheduleJob(when: Date | number | string, job: Job) {
    const description = job.description.trim();
    const prompt = job.prompt?.trim();
    if (!description) throw new Error("Describe the reminder or task.");
    if (when instanceof Date && Number.isNaN(when.getTime())) {
      throw new Error("That date isn't valid.");
    }
    const schedule = await this.schedule<Job>(
      when,
      JOB_CALLBACK,
      prompt ? { description, prompt } : { description },
      { idempotent: true }
    );
    return toJobInfo(schedule, "think");
  }

  @callable()
  async listJobs(): Promise<JobInfo[]> {
    const own = (await this.listSchedules())
      .filter(isJobSchedule)
      .map((s) => toJobInfo(s, "think"));
    const pi = await (await this.pi()).listOwnJobs().catch((error) => {
      console.error(error);
      return [];
    });
    return [...own, ...pi].sort(byNextRun);
  }

  @callable()
  async createJob(job: NewJob) {
    const when =
      job.when.type === "date" ? new Date(job.when.date) : job.when.cron.trim();
    return this.scheduleJob(when, job);
  }

  /** Cancels a job here or, for an older one, in the Pi assistant. */
  @callable()
  async cancelJob(id: string) {
    const schedule = await this.getScheduleById(id);
    if (schedule && isJobSchedule(schedule)) {
      return this.cancelSchedule(id);
    }
    return (await this.pi()).cancelOwnJob(id);
  }

  /** Shows a fired job in open chats of both harnesses. */
  private async notify(notice: JobNotice) {
    this.broadcast(JSON.stringify(notice));
    const pi = await this.pi();
    await pi.notify(notice).catch((error: unknown) => console.error(error));
  }

  /**
   * Runs when a job is due. A reminder notifies the user; a task becomes a
   * durable Think turn in the shared conversation, and its reply is sent
   * from onSubmissionStatus.
   */
  async executeTask(payload: JobPayload, schedule?: Schedule<JobPayload>) {
    const job = toJob(payload);
    if (!job.prompt) {
      await this.notify({
        type: "reminder",
        description: job.description,
        timestamp: new Date().toISOString()
      });
      await this.sendToTelegramOwner(`⏰ Reminder: ${job.description}`);
      return;
    }
    await this.submitMessages(
      [
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [
            {
              type: "text",
              text: `⏰ Scheduled task: ${job.description}\n\n${job.prompt}`
            }
          ]
        }
      ],
      {
        // At-least-once delivery: a retried run of the same occurrence
        // returns the existing submission.
        idempotencyKey: schedule
          ? `job:${schedule.id}:${schedule.time}`
          : undefined,
        metadata: {
          source: SCHEDULED_TASK_SOURCE,
          description: job.description
        }
      }
    );
  }

  protected async onSubmissionStatus(submission: ThinkSubmissionInspection) {
    if (submission.metadata?.source !== SCHEDULED_TASK_SOURCE) return;
    if (submission.status !== "completed" && submission.status !== "error") {
      return;
    }
    const description = String(submission.metadata.description ?? "");
    const ok = submission.status === "completed";
    const reply = submission.messageId
      ? this.messages.find((m) => m.id === submission.messageId)
      : [...this.messages].reverse().find((m) => m.role === "assistant");
    const text = ok
      ? (reply && messageText(reply)) || "(no reply)"
      : (submission.error ?? "The task failed.");
    await this.notify({
      type: "task-result",
      description,
      ok,
      text,
      timestamp: new Date().toISOString()
    });
    await this.sendToTelegramOwner(
      ok ? `✅ ${description}\n\n${text}` : `⚠️ ${description} failed: ${text}`
    );
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

  // Telegram turns and scheduled tasks have nobody to approve a tool, so
  // they run without the approval-gated ones.
  beforeTurn(ctx: TurnContext) {
    const scheduled = ctx.trigger === "submission";
    if (!ctx.messenger && !scheduled) return;
    return {
      activeTools: Object.keys(ctx.tools).filter(
        (name) => !NEEDS_APPROVAL.includes(name)
      ),
      instructions: this.buildSystemPrompt({
        commandsAllowed: false,
        scheduled
      })
    };
  }

  // Called every turn (no context blocks are configured), so the memory list
  // and the current date are always fresh.
  getSystemPrompt() {
    return this.buildSystemPrompt({ commandsAllowed: true });
  }

  /**
   * `commandsAllowed` is false for Telegram turns and scheduled tasks, where
   * the approval-gated tools are withheld (see beforeTurn).
   */
  private buildSystemPrompt({
    commandsAllowed,
    scheduled = false
  }: {
    commandsAllowed: boolean;
    scheduled?: boolean;
  }) {
    const memories = this
      .sql<Memory>`SELECT id, content FROM memories ORDER BY id`;
    const sandbox = commandsAllowed
      ? "Use runCommand to run shell commands, and writeSandboxFile / readSandboxFile for files."
      : "Use readSandboxFile to read files.";
    return `${buildPersona(this.getSettingsRow())}

You have a long-term memory about the user. When they share something worth remembering (name, preferences, people in their life, goals, ongoing projects, important dates), save it with the remember tool without asking. Use what you know naturally — don't recite the memory back. If something you remembered is no longer true, forget it and remember the new fact.

What you remember about the user:
${formatMemories(memories)}

${getSchedulePrompt({ date: new Date() })}

${timeNote(this.getTimezone())}

When the user asks to be reminded of something, or wants something done at a later or recurring time, use the scheduleTask tool.${
      scheduled
        ? "\n\nThis turn was started by a scheduled task the user set up earlier, not typed by them now. Carry out the task and reply with the result; your reply is sent to the user as a notification."
        : ""
    }

For a quick calculation or data transformation, use runCode: it runs JavaScript (or Python) in an isolated, short-lived runtime with no network and no files, and returns the output in about a second. Prefer JavaScript, which starts faster.

You also have a Linux sandbox (Node.js 24 on Debian, with internet access; no Python preinstalled, install tools with apt-get) that keeps files between turns (working directory /workspace). ${sandbox} The first command after a while takes longer while the sandbox starts. Use browseWeb to open a web page and read its text. Use searchKnowledge to look things up in the user's uploaded documents.`;
  }

  getTools(): ToolSet {
    const sandbox = this.env.SANDBOX.getByName(this.name);

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
        description: SCHEDULE_TOOL_DESCRIPTION,
        inputSchema: scheduleSchema.extend({
          prompt: z
            .string()
            .optional()
            .describe(
              "For a task: the instruction to carry out when it runs. Leave out for a plain reminder."
            )
        }),
        execute: async ({ when, description, prompt }) => {
          if (when.type === "no-schedule") {
            return "Not a valid schedule input";
          }
          const input =
            when.type === "scheduled"
              ? new Date(when.date)
              : when.type === "delayed"
                ? when.delayInSeconds
                : when.type === "cron"
                  ? when.cron
                  : null;
          if (input === null) return "Invalid schedule type";
          try {
            const job = await this.scheduleJob(input, { description, prompt });
            return { scheduled: job };
          } catch (error) {
            return `Error scheduling: ${error}`;
          }
        }
      }),

      getScheduledTasks: tool({
        description: "List the scheduled reminders and tasks",
        inputSchema: z.object({}),
        execute: async () => {
          const jobs = await this.listJobs();
          return jobs.length > 0 ? jobs : "Nothing is scheduled.";
        }
      }),

      cancelScheduledTask: tool({
        description: "Cancel a scheduled reminder or task by its ID",
        inputSchema: z.object({
          taskId: z.string().describe("The ID of the job to cancel")
        }),
        execute: async ({ taskId }) => {
          try {
            return (await this.cancelJob(taskId))
              ? `Cancelled ${taskId}.`
              : `Nothing scheduled with id ${taskId}.`;
          } catch (error) {
            return `Error cancelling: ${error}`;
          }
        }
      }),

      runCommand: tool({
        description:
          "Run a shell command (sh) in the Linux sandbox, starting in /workspace. Files and installed packages persist across turns while the sandbox is running. Returns the exit code, stdout and stderr.",
        inputSchema: z.object({
          command: z.string().describe("The shell command to run"),
          timeoutSeconds: z
            .number()
            .int()
            .min(1)
            .max(300)
            .optional()
            .describe("Give up after this many seconds (default 60)")
        }),
        // Runs only after the user approves it in the chat.
        needsApproval: true,
        execute: async ({ command, timeoutSeconds }) =>
          sandbox.runCommand(command, (timeoutSeconds ?? 60) * 1000)
      }),

      writeSandboxFile: tool({
        description:
          "Write a text file in the Linux sandbox. Relative paths resolve against /workspace.",
        inputSchema: z.object({
          path: z.string().describe("File path, e.g. notes/todo.md"),
          content: z.string().describe("The full file content")
        }),
        needsApproval: true,
        execute: async ({ path, content }) => sandbox.writeFile(path, content)
      }),

      readSandboxFile: tool({
        description:
          "Read a text file from the Linux sandbox. Relative paths resolve against /workspace.",
        inputSchema: z.object({
          path: z.string().describe("File path to read")
        }),
        execute: async ({ path }) => sandbox.readFile(path)
      }),

      runCode: tool({
        description:
          "Run a JavaScript (default) or Python snippet in a fresh, isolated runtime with no network, no files and a 5 s CPU limit. JavaScript runs as the body of an async function: use console.log and/or return a value. Python: print the output. Best for calculations, parsing and data transformations.",
        inputSchema: z.object({
          language: z.enum(["javascript", "python"]).default("javascript"),
          code: z.string().describe("The code to run")
        }),
        execute: async ({ language, code }) => {
          try {
            return await runCode(this.env, language, code);
          } catch (error) {
            return { logs: "", error: `The runtime stopped: ${error}` };
          }
        }
      }),

      searchKnowledge: tool({
        description:
          "Search the user's knowledge base (documents uploaded to AI Search) for passages relevant to a question. Use it before answering questions about the user's own documents or notes.",
        inputSchema: z.object({
          query: z.string().describe("What to look for, in natural language")
        }),
        execute: async ({ query }) => {
          try {
            const instance = this.env.AI_SEARCH.get(KNOWLEDGE_INSTANCE);
            const results = await instance.search({
              messages: [{ role: "user", content: query }]
            });
            return JSON.stringify(results).slice(0, 8000);
          } catch (error) {
            return `Error searching the knowledge base: ${error}`;
          }
        }
      }),

      browseWeb: tool({
        description:
          "Open a web page in a headless browser (JavaScript runs) and return its title and visible text. Use it for pages that need rendering, or to read a page the user links.",
        inputSchema: z.object({
          url: z.string().url().describe("Full http(s) URL to open")
        }),
        execute: async ({ url }) => {
          try {
            const page = await browsePage(this.env, url);
            return `${page.title}\n${page.url}\n\n${page.text}`;
          } catch (error) {
            return `Error opening ${url}: ${error}`;
          }
        }
      })
    };
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
      if (url.pathname.startsWith("/messengers/telegram/")) {
        return await handleTelegramWebhook(request, env);
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
        if (harness === "pi") {
          return (await getAgentByName(env.PiAssistant, name)).fetch(request);
        }
        const agent = await getAgentByName(env.Assistant, name);
        if (request.headers.get("Upgrade") === "websocket") {
          const cf = request.cf as IncomingRequestCfProperties | undefined;
          await agent.setOwner(user.email, cf?.timezone ?? null);
        }
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
