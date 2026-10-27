import { Think, type TurnContext } from "@cloudflare/think";
import type { ThinkMessengers } from "@cloudflare/think/messengers";
import { callable, getCurrentAgent } from "agents";
import type { LanguageModel, ToolSet } from "ai";

import {
  applySettingsPatch,
  MCP_CALLBACK_PATH,
  toPublicSettings,
  type AssistantRpc,
  type EmailPolicy,
  type ServerEvent,
  type SettingsPatch
} from "@cot/shared";

import { isAllowed } from "../../auth/session";
import { EmailChannel } from "../../integrations/email/channel";
import { toEmailStatus } from "../../integrations/email/config";
import { Inbox } from "../../integrations/email/inbox";
import type { ParsedEmail } from "../../integrations/email/parse";
import {
  TelegramChannel,
  type TelegramUpdateResult
} from "../../integrations/telegram/channel";
import { buildPersona } from "../common/prompt";
import { broadcastReminder } from "../common/reminders";
import { modelFor } from "./model";
import { AssistantStore } from "./store";
import { buildSystemPrompt } from "./system-prompt";
import { assistantTools, NEEDS_APPROVAL } from "./tools";

/**
 * A personal assistant. Each signed-in Google account gets its own Durable
 * Object instance, which keeps the chat history, long-term memories and
 * scheduled reminders for that person. Its memories are also the memory of
 * the same person's Pi assistant, which reads and writes them over RPC.
 *
 * Think runs the agentic loop, persists the conversation and resumes
 * interrupted turns; this class only supplies the model, prompt and tools,
 * and exposes the callables in AssistantRpc. The user's own Telegram bot,
 * once connected, shares this same conversation (integrations/telegram).
 * Its own email address files incoming mail in an inbox (integrations/email).
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
      ownerAllowed: () => this.allowedOwner() !== null,
      // Restart after the current reply goes out so Think re-reads the bot.
      onBotChanged: () => {
        setTimeout(() => this.ctx.abort("Telegram bot changed"), 500);
      }
    });
  }

  private get email() {
    return new EmailChannel({
      env: this.env,
      userId: () => this.name.slice("google:".length),
      store: this.store,
      inbox: () => new Inbox(this),
      owner: () => this.allowedOwner(),
      onEmail: (email, trusted, preview) =>
        this.announceEmail(email, trusted, preview)
    });
  }

  /** The owner's email while it is still in ALLOWED_EMAILS. */
  private allowedOwner() {
    const email = this.store.getOwnerEmail();
    return email && isAllowed(email, this.env) ? email : null;
  }

  private emailAddress() {
    const status = toEmailStatus(
      this.store.getEmailConfig(),
      this.env.EMAIL_DOMAIN
    );
    return status.enabled ? status.address : null;
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
    return this.systemPrompt(true);
  }

  override beforeTurn(ctx: TurnContext) {
    if (!ctx.messenger) return;
    return {
      activeTools: Object.keys(ctx.tools).filter(
        (name) => !NEEDS_APPROVAL.has(name)
      ),
      instructions: this.systemPrompt(false)
    };
  }

  override getTools(): ToolSet {
    return assistantTools({
      env: this.env,
      agent: this,
      memory: this,
      sandbox: this.env.SANDBOX.getByName(this.name),
      inbox: this.emailAddress() ? () => new Inbox(this) : null
    });
  }

  override getMessengers(): ThinkMessengers {
    this.store.ensureTables();
    return this.telegram.messengers();
  }

  private systemPrompt(commandsAllowed: boolean) {
    return buildSystemPrompt({
      settings: this.store.getSettings(),
      memories: this.store.listMemories(),
      commandsAllowed,
      emailAddress: this.emailAddress()
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

  /** Sends a fired reminder to the owner of the connected bot, if any. */
  async sendTelegramReminder(description: string) {
    await this.telegram.sendReminder(description);
  }

  // ── Email (callables + Worker RPC) ──────────────────────────────────

  @callable()
  async getEmailStatus() {
    return this.email.status();
  }

  @callable()
  async newEmailAddress() {
    return this.email.newAddress();
  }

  @callable()
  async updateEmailPolicy(policy: EmailPolicy) {
    return this.email.updatePolicy(policy);
  }

  /** Called by the Worker's email handler with the raw message. */
  async receiveEmail(envelopeFrom: string, raw: Uint8Array) {
    this.store.ensureTables();
    return this.email.receive(envelopeFrom, raw);
  }

  private async announceEmail(
    email: ParsedEmail,
    trusted: boolean,
    preview: string | null
  ) {
    // Like reminders, a broadcast rather than a chat message, so new mail
    // never starts a model turn on its own.
    const event: ServerEvent = {
      type: "email",
      from: email.from,
      subject: email.subject,
      trusted,
      timestamp: new Date().toISOString()
    };
    this.broadcast(JSON.stringify(event));
    const sender = trusted ? email.from : `${email.from} (unknown sender)`;
    await this.telegram.notify(
      `📧 New email from ${sender}\n${email.subject}${preview ? `\n\n${preview}` : ""}`
    );
  }

  // ── RPC for the Worker and the Pi assistant ─────────────────────────

  /** The owner's email, recorded by the Worker on every web connection. */
  async setOwnerEmail(email: string) {
    this.store.ensureTables();
    this.store.setOwnerEmail(email);
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

  // ── Scheduled reminders fire here ───────────────────────────────────

  async executeTask(description: string) {
    broadcastReminder(this, description);
    await this.sendTelegramReminder(description);
  }
}
