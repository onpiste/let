import {
  Think,
  type ThinkSubmissionInspection,
  type TurnContext
} from "@cloudflare/think";
import type { ThinkMessengers } from "@cloudflare/think/messengers";
import {
  callable,
  getAgentByName,
  getCurrentAgent,
  type Schedule
} from "agents";
import type { LanguageModel, ToolSet } from "ai";

import {
  applySettingsPatch,
  MCP_CALLBACK_PATH,
  toPublicSettings,
  type AssistantRpc,
  type NewJob,
  type SettingsPatch
} from "@cot/shared";

import { isAllowed } from "../../auth/session";
import {
  TelegramChannel,
  type TelegramUpdateResult
} from "../../integrations/telegram/channel";
import type { Job, JobPayload } from "../common/jobs";
import { buildPersona, timeNote } from "../common/prompt";
import { AssistantJobs } from "./jobs";
import { modelFor } from "./model";
import { AssistantStore } from "./store";
import { buildSystemPrompt } from "./system-prompt";
import { assistantTools, NEEDS_APPROVAL } from "./tools";

/**
 * A personal assistant. Each signed-in Google account gets its own Durable
 * Object instance, which keeps the chat history, long-term memories and
 * scheduled jobs for that person. Its memories and jobs are also those of
 * the same person's Pi assistant, which reaches them over RPC.
 *
 * Think runs the agentic loop, persists the conversation and resumes
 * interrupted turns; this class only supplies the model, prompt and tools,
 * and exposes the callables in AssistantRpc. The user's own Telegram bot,
 * once connected, shares this same conversation (integrations/telegram).
 *
 * Only the signed-in owner can reach an instance (see http/router.ts).
 */
export class Assistant extends Think<Env> implements AssistantRpc {
  // Getters rather than fields: Think calls getMessengers() before
  // subclass fields would be initialised.
  private get store() {
    return new AssistantStore(this);
  }

  private get telegram() {
    return new TelegramChannel({
      env: this.env,
      userId: () => this.name.slice("google:".length),
      store: this.store,
      ownerAllowed: () => {
        const email = this.store.getOwnerEmail();
        return Boolean(email && isAllowed(email, this.env));
      },
      // Restart after the current reply goes out so Think re-reads the bot.
      onBotChanged: () => {
        setTimeout(() => this.ctx.abort("Telegram bot changed"), 500);
      }
    });
  }

  private get jobs() {
    return new AssistantJobs({
      agent: this,
      pi: () => getAgentByName(this.env.PiAssistant, this.name),
      sendToTelegram: (text) => this.sendToTelegramOwner(text)
    });
  }

  override onStart() {
    this.store.ensureTables();

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

  // ── Think hooks ─────────────────────────────────────────────────────

  override getModel(): string | LanguageModel {
    return modelFor(this.store.getSettings());
  }

  // Called every turn (no context blocks are configured), so the memory list
  // and the current date are always fresh.
  override getSystemPrompt() {
    return this.systemPrompt({ commandsAllowed: true });
  }

  // Telegram turns and scheduled tasks (submissions) have nobody to approve
  // a tool, so they run without the approval-gated ones.
  override beforeTurn(ctx: TurnContext) {
    const scheduled = ctx.trigger === "submission";
    if (!ctx.messenger && !scheduled) return;
    return {
      activeTools: Object.keys(ctx.tools).filter(
        (name) => !NEEDS_APPROVAL.has(name)
      ),
      instructions: this.systemPrompt({ commandsAllowed: false, scheduled })
    };
  }

  protected override async onSubmissionStatus(
    submission: ThinkSubmissionInspection
  ) {
    await this.jobs.onSubmission(submission);
  }

  override getTools(): ToolSet {
    return assistantTools({
      env: this.env,
      jobs: this,
      memory: this,
      sandbox: this.env.SANDBOX.getByName(this.name)
    });
  }

  override getMessengers(): ThinkMessengers {
    this.store.ensureTables();
    return this.telegram.messengers();
  }

  private systemPrompt(options: {
    commandsAllowed: boolean;
    scheduled?: boolean;
  }) {
    return buildSystemPrompt({
      settings: this.store.getSettings(),
      memories: this.store.listMemories(),
      timezone: this.store.getTimezone(),
      ...options
    });
  }

  // ── Settings (callables) ────────────────────────────────────────────

  @callable()
  async getSettings() {
    return toPublicSettings(this.store.getSettings());
  }

  @callable()
  async updateSettings(patch: SettingsPatch) {
    const next = applySettingsPatch(this.store.getSettings(), patch);
    this.store.saveSettings(next);
    return toPublicSettings(next);
  }

  // ── MCP servers (callables). Think adds their tools to every turn. ──

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

  // ── Telegram (callables + webhook RPC) ──────────────────────────────

  @callable()
  async getTelegramStatus() {
    return this.telegram.status();
  }

  @callable()
  async connectTelegram(token: string) {
    const uri = getCurrentAgent().connection?.uri;
    const origin = uri ? new URL(uri).origin.replace(/^ws/, "http") : null;
    return this.telegram.connect(token, origin);
  }

  @callable()
  async newTelegramClaimLink() {
    return this.telegram.newClaimLink();
  }

  @callable()
  async disconnectTelegram() {
    return this.telegram.disconnect();
  }

  /** Called by the Worker for each webhook update. */
  async receiveTelegramUpdate(
    secret: string,
    body: string
  ): Promise<TelegramUpdateResult> {
    this.store.ensureTables();
    return this.telegram.receive(secret, body);
  }

  /** Sends a message to the owner of the connected bot, if any. */
  async sendToTelegramOwner(text: string) {
    await this.telegram.sendToOwner(text);
  }

  // ── Scheduled jobs (callables + RPC), kept for both harnesses ───────

  @callable()
  async listJobs() {
    return this.jobs.list();
  }

  @callable()
  async createJob(job: NewJob) {
    return this.jobs.create(job);
  }

  @callable()
  async cancelJob(id: string) {
    return this.jobs.cancel(id);
  }

  /** Used by the scheduleTask tool of both harnesses. */
  async scheduleJob(when: Date | number | string, job: Job) {
    return this.jobs.schedule(when, job);
  }

  /** The schedule callback: a job is due. */
  async executeTask(payload: JobPayload, schedule?: Schedule<JobPayload>) {
    await this.jobs.run(payload, schedule);
  }

  // ── RPC for the Worker and the Pi assistant ─────────────────────────

  /**
   * The owner's email and the time zone Cloudflare saw them in, recorded by
   * the Worker on every web connection.
   */
  async setOwner(email: string, timezone: string | null) {
    this.store.ensureTables();
    this.store.setOwnerEmail(email);
    if (timezone) this.store.setTimezone(timezone);
  }

  /** The current time for the Pi assistant's prompt. */
  async getTimeNote() {
    return timeNote(this.store.getTimezone());
  }

  /** The persona text, also used by the Pi assistant. */
  async getPersona() {
    return buildPersona(this.store.getSettings());
  }

  async getMemories() {
    return this.store.listMemories();
  }

  async addMemory(content: string) {
    this.store.addMemory(content);
  }

  async removeMemory(id: number) {
    this.store.removeMemory(id);
  }
}
